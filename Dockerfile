FROM node:22-bookworm-slim AS build
WORKDIR /app

# Frontend: lockfile is complete enough for npm ci
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Backend: use npm install so Linux can resolve vitest's optional vite peer
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm install
COPY backend/ ./
RUN mkdir -p public \
  && cp -r /app/frontend/dist/. public/ \
  && npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/backend/package.json /app/backend/package-lock.json ./
RUN npm install --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/public ./public
EXPOSE 8080
CMD ["node", "dist/server.js"]
