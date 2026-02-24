#!/bin/bash
# Script per avviare Legistra in modalità sviluppo
# Avvia sia il backend che il frontend

echo "🚀 Avvio Legistra Development Environment"
echo "======================================"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directory base
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Funzione per terminare processi in background
cleanup() {
    echo -e "\n${RED}Terminazione in corso...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Installa dipendenze backend se necessario
if [ ! -d "$BASE_DIR/server/node_modules" ]; then
    echo -e "${BLUE}📦 Installazione dipendenze backend...${NC}"
    cd "$BASE_DIR/server"
    npm install
fi

# Installa dipendenze frontend se necessario
if [ ! -d "$BASE_DIR/chat-app/node_modules" ]; then
    echo -e "${BLUE}📦 Installazione dipendenze frontend...${NC}"
    cd "$BASE_DIR/chat-app"
    npm install
fi

# Avvia backend in modalità sviluppo (legge chat-app/.env)
echo -e "${GREEN}🖥️  Avvio Backend Server (porta 3001)...${NC}"
cd "$BASE_DIR/server"
npm run dev &
BACKEND_PID=$!

# Attendi che il backend sia pronto
sleep 2

# Avvia frontend
echo -e "${GREEN}🌐 Avvio Frontend (porta 5173)...${NC}"
cd "$BASE_DIR/chat-app"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ Tutto avviato!${NC}"
echo "======================================"
echo -e "Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "Backend:  ${BLUE}http://localhost:3001${NC}"
echo ""
echo "Premi Ctrl+C per terminare"
echo ""

# Attendi
wait
