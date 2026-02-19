FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json ./
RUN npm install --production

# Copy built files
COPY --from=builder /app/dist ./dist

EXPOSE 3060

CMD ["node", "dist/index.js"]
