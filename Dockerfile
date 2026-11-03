FROM node:24.22.2-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY shared shared
COPY server server
COPY tsconfig.server.json ./
RUN npm run server:build
FROM node:24.22.2-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=build /app/dist-server ./dist-server
COPY package*.json ./
RUN npm ci --omit=dev && npm cache verify
USER node
EXPOSE 8787
CMD ["node","dist-server/server/index.js"]
