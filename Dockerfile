# KATANA FIGHT — un solo contenedor: juego estático + emparejamiento WS +
# generación de personajes de LA FORJA (Nano Banana / Gemini vía Python).
# Debian slim (no alpine) para que las ruedas de google-genai instalen sin compilar.
FROM node:22-slim

WORKDIR /app

# Node
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Python + deps para generar el arte de LA FORJA (tools/generar_parte.py).
# python3-pil viene precompilado por apt (evita compilar Pillow); google-genai por pip.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pil python3-pip \
    && pip3 install --no-cache-dir --break-system-packages google-genai \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY index.html beat.html forja.html forja_admin.html og.png ./
# SEO: robots + sitemap en la raíz
COPY robots.txt sitemap.xml ./
COPY assets ./assets
# datos del juego que el cliente carga en runtime (los producen los
# editores locales, pero el juego los consume en producción)
COPY escenas.json rigs.json chars.json ./
COPY js ./js
# scripts de generación que usa LA FORJA en runtime (generar_parte.py +
# generate_art.py que reutiliza). Los editores /api/* siguen bloqueados por DEV;
# aquí no se copian los *.html de edición.
COPY tools ./tools
COPY server/server.js ./server/

# el volumen katana_data se monta en server/data (ranking + datos de la forja);
# debe existir con dueño node. Los crudos de debug de Gemini van a /tmp (efímero,
# escribible por node) vía RAW_DIR.
RUN mkdir -p server/data && chown node:node server/data \
    && mkdir -p /tmp/katana_raw && chown node:node /tmp/katana_raw

ENV NODE_ENV=production PORT=8081 RAW_DIR=/tmp/katana_raw
EXPOSE 8081
USER node
CMD ["node", "server/server.js"]
