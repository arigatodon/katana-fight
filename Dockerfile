# KATANA FIGHT — un solo contenedor: juego estático + emparejamiento WS
FROM node:22-alpine

WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY index.html beat.html og.png ./
COPY assets ./assets
# datos del juego que el cliente carga en runtime (los producen los
# editores locales, pero el juego los consume en producción)
COPY escenas.json rigs.json chars.json ./
COPY js ./js
COPY server/server.js ./server/
# NOTA: los editores (rig_editor.html, escena_editor.html, tools/) y sus
# APIs /api/* quedan FUERA de la imagen a propósito — son herramientas de
# desarrollo local. El server las bloquea igual con DEV (404 en prod).

# ranking en línea: el volumen katana_data (deploy.yml) se monta aquí;
# el dir debe existir con dueño node para que el volumen herede permisos
RUN mkdir -p server/data && chown node:node server/data

ENV NODE_ENV=production PORT=8081
EXPOSE 8081
USER node
CMD ["node", "server/server.js"]
