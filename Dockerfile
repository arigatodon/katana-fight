# KATANA FIGHT — un solo contenedor: juego estático + emparejamiento WS
FROM node:22-alpine

WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY index.html ./
COPY js ./js
COPY server/server.js ./server/

# ranking en línea: el volumen katana_data (deploy.yml) se monta aquí;
# el dir debe existir con dueño node para que el volumen herede permisos
RUN mkdir -p server/data && chown node:node server/data

ENV NODE_ENV=production PORT=8081
EXPOSE 8081
USER node
CMD ["node", "server/server.js"]
