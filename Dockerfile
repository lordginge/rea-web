FROM node:22-bookworm-slim

# Chromium for REA's website analysis
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/boot.js"]
