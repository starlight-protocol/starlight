# 🛰️ Starlight Hub: Cloud Orchestrator Dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY src/ ./src/
COPY test/ ./test/
COPY sdk/ ./sdk/
COPY sentinels/ ./sentinels/

# Expose Starlight Bus Port
EXPOSE 8080

# Environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99

# Run the Hub
CMD ["node", "src/hub.js"]
