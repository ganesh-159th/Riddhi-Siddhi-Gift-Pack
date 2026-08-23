#!/bin/bash
# ============================================
#  Riddhi Siddhi Gift & Pack — local server
#  Run:  ./serve.sh     (from project folder)
#  Site: http://localhost:3000
# ============================================
PORT=3000
cd "$(dirname "$0")"

# stop any old copies of this site first (single-port guarantee)
lsof -ti :$PORT | xargs kill -9 2>/dev/null

echo "✔ Old servers stopped"
echo "▶ Website live at: http://localhost:$PORT"
echo "  Press Ctrl+C to stop"
open "http://localhost:$PORT"
python3 -m http.server $PORT
