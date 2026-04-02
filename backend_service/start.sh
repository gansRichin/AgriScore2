#!/bin/bash

# 1. Запускаем Ollama в фоновом режиме
ollama serve &
# Ждем пару секунд для инициализации демона
sleep 5

# 2. Собираем локальную модель на основе Modelfile
ollama create agriscore -f models/Modelfile

# 3. Запускаем FastAPI сервер
uvicorn explainer:app --host 0.0.0.0 --port $PORT
