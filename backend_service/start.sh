#!/bin/bash
set -e

echo "Training model..."
python /app/train_on_start.py

echo "Starting FastAPI server on port $PORT..."
exec uvicorn explainer:app --host 0.0.0.0 --port $PORT