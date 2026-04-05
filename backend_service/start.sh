#!/bin/bash
set -e

# Запускаем FastAPI в foreground (это держит контейнер живым)
echo "Starting FastAPI server on port $PORT..."
exec uvicorn explainer:app --host 0.0.0.0 --port $PORT