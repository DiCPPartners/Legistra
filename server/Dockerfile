# Legistra Server - Production Dockerfile
FROM node:20-alpine

# Installa dipendenze di sistema per canvas/pdf processing
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev

# Crea directory app
WORKDIR /app

# Copia package files
COPY package*.json ./

# Installa dipendenze
RUN npm ci --only=production

# Copia codice sorgente
COPY . .

# Crea directory necessarie
RUN mkdir -p uploads processed logs

# Imposta variabili ambiente
ENV NODE_ENV=production
ENV PORT=3001

# Espone porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Avvia server
CMD ["node", "index.js"]
