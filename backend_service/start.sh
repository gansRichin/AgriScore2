#!/bin/bash
set -e

echo "Starting FastAPI server on port $PORT..."
WEB_CONCURRENCY=1 exec uvicorn explainer:app --host 0.0.0.0 --port $PORT