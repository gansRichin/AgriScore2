#!/bin/bash
set -e

# 1. Запускаем Ollama в фоне
ollama serve &
OLLAMA_PID=$!

# Ждем пару секунд для инициализации
sleep 5

# 2. Создаем локальную модель (если нужно)
if [ ! -d "models/.agriscore_model_created" ]; then
    ollama create agriscore -f models/Modelfile
    mkdir -p models/.agriscore_model_created
fi

# 3. Запускаем FastAPI сервер
uvicorn explainer:app --host 0.0.0.0 --port $PORT
