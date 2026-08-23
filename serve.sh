#!/bin/bash
# ============================================
#  Riddhi Siddhi Gift & Pack — React dev server
#  Run:  ./serve.sh     (from project folder)
#  Site: http://localhost:3000
#  Admin: http://localhost:3000/admin.html
# ============================================
PORT=3000
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "▶ Installing dependencies (first run only)…"
  npm install
fi

# stop any old copies of this site first (single-port guarantee)
lsof -ti :$PORT | xargs kill -9 2>/dev/null

echo "✔ Old servers stopped"
echo "▶ Website live at: http://localhost:$PORT"
echo "  Admin panel:      http://localhost:$PORT/admin.html"
echo "  Press Ctrl+C to stop"
open "http://localhost:$PORT"
npm run dev -- --port $PORT --strictPort
