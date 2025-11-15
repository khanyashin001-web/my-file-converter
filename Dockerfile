# 1. Start with a Node.js 18 base image
FROM node:18-slim

# 2. Set the working directory in the container
WORKDIR /app

# 3. Install system dependencies
# We need 'poppler-utils' for the `pdftocairo` command
# 'procps' is good for Render's health checks
RUN apt-get update && apt-get install -y \
    poppler-utils \
    procps \
 && rm -rf /var/lib/apt/lists/*

# 4. Copy package files and install npm dependencies
COPY package.json package-lock.json ./
# We use '--production' to skip development-only packages
RUN npm install --production

# 5. Copy the rest of your application code
COPY . .

# 6. Tell Render what command to run to start your app
CMD ["node", "server.js"]
