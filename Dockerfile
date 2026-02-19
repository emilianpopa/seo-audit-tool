FROM node:18-slim

# Install Chromium (apt resolves all required dependencies automatically)
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source
COPY . .

# Create reports directory
RUN mkdir -p reports

EXPOSE 3000

# Run migrations then start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"]
