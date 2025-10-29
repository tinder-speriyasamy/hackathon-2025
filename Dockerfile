# Use Node.js 20 LTS
FROM node:20-slim

# Install dependencies for Puppeteer and Redis
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Configure npm to use public registry (override any local .npmrc settings)
RUN echo "registry=https://registry.npmjs.org/" > /root/.npmrc

# Install Node.js dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Copy application code
COPY . .

# Copy .env file directly into container
COPY .env .env

# Create Redis data directory
RUN mkdir -p /data

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Start Redis in background with persistence\n\
echo "Starting Redis..."\n\
redis-server --daemonize yes --dir /data --save 60 1 --appendonly yes --loglevel warning\n\
sleep 2\n\
redis-cli ping || { echo "Redis failed to start"; exit 1; }\n\
echo "Redis started successfully"\n\
\n\
# Display public URL for Twilio webhook configuration\n\
if [ ! -z "$PUBLIC_DOMAIN" ]; then\n\
  echo "================================================"\n\
  echo "🌐 PUBLIC URL: $PUBLIC_DOMAIN"\n\
  echo "📱 Twilio webhook URL: $PUBLIC_DOMAIN/webhooks/sms"\n\
  echo "================================================"\n\
fi\n\
\n\
# Start the Node.js application\n\
echo "Starting application..."\n\
exec npm start\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE 3000

# Use startup script
CMD ["/app/start.sh"]
