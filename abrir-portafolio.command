#!/bin/bash
cd "$(dirname "$0")"

PORT=3000

# Si el puerto está ocupado, busca uno libre
while lsof -i :$PORT &>/dev/null; do
  PORT=$((PORT + 1))
done

echo "Levantando servidor en http://localhost:$PORT ..."
python3 -m http.server $PORT &
SERVER_PID=$!

sleep 0.5
open "http://localhost:$PORT"

echo "Servidor corriendo (PID $SERVER_PID). Cerrá esta ventana para apagarlo."
wait $SERVER_PID
