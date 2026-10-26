# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
# npm ci instead of npm install:
#   ci = "clean install"
#   → Removes the old node_modules, installs the exact versions in package-lock.json
#   → Ensures every environment (dev, CI, production) uses the SAME versions
#   → Faster than npm install because it skips the resolution step
COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]