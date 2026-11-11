FROM node:26.13.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY shared shared
COPY server server
COPY tsconfig.server.json ./
RUN npm run server:build
FROM node:26.13.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=build /app/dist-server ./dist-server
COPY package*.json ./
RUN npm ci --omit=dev && npm cache verify
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8787
CMD ["node","dist-server/server/index.js"]
