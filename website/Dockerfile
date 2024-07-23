# Use the official Node.js image from the Docker Hub
FROM node:20.15.1

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy local code to the container image
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Start the application
CMD [ "node", "app.js" ]
