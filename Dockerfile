FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix frontend && npm ci --prefix backend
COPY frontend ./frontend
COPY backend ./backend
WORKDIR /app/backend
RUN npm run build:ui && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/public ./public
EXPOSE 8080
CMD ["node", "dist/server.js"]