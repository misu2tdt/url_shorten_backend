# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
# npm ci thay vì npm install:
#   ci = "clean install"
#   → Xóa node_modules cũ, cài đúng versions trong package-lock.json
#   → Đảm bảo mọi môi trường (dev, CI, production) dùng CÙNG versions
#   → Nhanh hơn npm install vì skip resolution step
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