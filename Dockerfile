# KATANA FIGHT — un solo contenedor: juego estático + emparejamiento WS
FROM node:22-alpine

WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY index.html ./
COPY js ./js
COPY server/server.js ./server/

ENV NODE_ENV=production PORT=8081
EXPOSE 8081
USER node
CMD ["node", "server/server.js"]
