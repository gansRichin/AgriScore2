FROM python:3.10-slim

RUN apt-get update && apt-get install -y curl zstd && rm -rf /var/lib/apt/lists/*

# Устанавливаем Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh
