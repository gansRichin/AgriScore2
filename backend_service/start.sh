#!/bin/bash
set -e

# 1. Запускаем Ollama в фоновом режиме
ollama serve --host 0.0.0.0 --port 11434 &
OLLAMA_PID=$!

# 2. Ждем, пока Ollama поднимется
echo "Waiting for Ollama to start..."
sleep 10

# 3. Создаем модель (если нужно)
if ! ollama list | grep -q agriscore; then
    echo "Creating agriscore model..."
    ollama create agriscore -f models/Modelfile
fi

# 4. Запускаем FastAPI в foreground (это держит контейнер живым)
exec uvicorn explainer:app --host 0.0.0.0 --port $PORT