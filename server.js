const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util'); // For 'promisify'
const { exec } = require('child_process'); // To run shell commands
const docxPDF = require('docx-pdf');
const mammoth = require('mammoth');
const JSZip = require('jszip');

// --- Create a 'promise' version of exec ---
const execPromise = util.promisify(exec);

const app = express();
const port =process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));

// --- MULTER STORAGE CONFIGURATION ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// --- ROUTES ---
app.get('/status', (req, res) => {
  res.send('Server is ACTIVE and ready for file uploads.');
});

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

// --- UPLOAD ROUTE (DYNAMIC) ---
app.post('/upload', upload.single('file_to_convert'), async (req, res) => {
  
  const { convertFrom, convertT } = req.body;
  const task = `${convertFrom}-to-${convertT}`;
  
  if (!req.file) {
    return res.status(400).send('No file was uploaded.');
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname;
  const baseName = path.parse(originalName).name;

  // --- Utility Function for Cleanup ---
  // (We will no longer call this function, but it's fine to leave it here)
  const cleanupFiles = (files) => {
    files.forEach(file => {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        console.error(`Error cleaning up file ${file}:`, err);
      }
    });
    console.log("Cleaned up temporary files.");
  };

  // --- Main Conversion Logic ---
  try {
    switch (task) {
      
      // --- CASE 1: DOCX to PDF ---
      case 'docx-to-pdf': {
        console.log(`Task Started: ${task}`);
        const outputPath = path.join(__dirname, 'converted', `${baseName}.pdf`);
        
        docxPDF(inputPath, outputPath, (err) => {
          if (err) {
            console.error("Conversion Error:", err);
            return res.status(500).send(`Error during conversion: ${err.message}`);
          }
          res.download(outputPath, `${baseName}.pdf`, () => {
            // --- CHANGE ---
            // cleanupFiles([inputPath, outputPath]); // Cleanup is now disabled
            console.log("Files are kept on server.");
          });
        });
        break;
      }
      
      // --- CASE 2: DOCX to TXT ---
      case 'docx-to-txt': {
        console.log(`Task Started: ${task}`);
        const outputPath = path.join(__dirname, 'converted', `${baseName}.txt`);
        const result = await mammoth.extractRawText({ path: inputPath });
        fs.writeFileSync(outputPath, result.value);
        
        res.download(outputPath, `${baseName}.txt`, () => {
          // --- CHANGE ---
          // cleanupFiles([inputPath, outputPath]); // Cleanup is now disabled
          console.log("Files are kept on server.");
        });
        break;
      }

      // --- CASE 3: PDF to PNG ---
      case 'pdf-to-png': {
        console.log(`Task Started: ${task}`);
        
        const convertedDir = path.join(__dirname, 'converted');
        const outputPathPrefix = path.join(convertedDir, `${baseName}_page`);

        const command = `pdftocairo -png "${inputPath}" "${outputPathPrefix}"`;
        await execPromise(command);

        const filesInConverted = fs.readdirSync(convertedDir);
        const pngFiles = filesInConverted.filter(
          file => file.startsWith(`${baseName}_page`) && file.endsWith('.png')
        );

        if (pngFiles.length === 0) {
          throw new Error("Poppler ran but created no PNG files.");
        }

        const zip = new JSZip();
        const filePathsToClean = [inputPath]; // We will still clean the *temp* PNGs

        for (const pngFile of pngFiles) {
          const pngPath = path.join(convertedDir, pngFile);
          const pngData = fs.readFileSync(pngPath);
          zip.file(pngFile, pngData);
          filePathsToClean.push(pngPath); // Add temp PNGs to be deleted
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        const zipPath = path.join(convertedDir, `${baseName}.zip`);
        fs.writeFileSync(zipPath, zipBuffer);
        // We will NOT add zipPath to the cleanup list
        
        res.download(zipPath, `${baseName}.zip`, () => {
          // --- CHANGE ---
          // We will *only* clean up the temp PNGs, but keep the original and the final zip
          // cleanupFiles(filePathsToClean); 
          console.log("Final .zip and original upload are kept on server.");
        });
        break;
      }

      // --- DEFAULT: All other placeholder tasks ---
      default: {
        console.log(`Placeholder task: ${task}`);
        // ... (rest of default logic is unchanged)
        
        // --- CHANGE ---
        // cleanupFiles([inputPath]); // Cleanup is now disabled
        res.send(`
          <style>body { font-family: -apple-system, sans-serif; margin: 40px; } .container { max-width: 600px; margin: auto; padding: 2rem; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); } a { color: #007aff; text-decoration: none; } a:hover { text-decoration: underline; }</style>
          <div class="container">
              <h1>Task Not Implemented</h1>
              <p>You asked to convert <strong>${convertFrom.toUpperCase()}</strong> to <strong>${convertT.toUpperCase()}</strong>.</p>
              <br>
              <p><a href="/">Convert another file</a></p>
          </div>
        `);
        break;
      }
    }
  } catch (error) {
    // --- Error Handling ---
    console.error(`Conversion failed for task: ${task}`, error);
    // --- CHANGE ---
    // cleanupFiles([inputPath]); // Cleanup is now disabled
    res.status(500).send(`
      <style>body { font-family: -apple-system, sans-serif; margin: 40px; } .container { max-width: 600px; margin: auto; padding: 2rem; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); } a { color: #007aff; text-decoration: none; } a:hover { text-decoration: underline; }</style>
      <div class="container">
          <h1>Conversion Failed</h1>
          <p>The server encountered an error while trying to convert your file.</p>
          <p><strong>Task:</strong> ${task}</p>
          <p><strong>Error:</strong> ${error.message}</p>
          <br>
          <p><a href="/">Try again</a></p>
      </div>
    `);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`SDOCX Converter server running at http://localhost:${port}`);
});
