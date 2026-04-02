FROM python:3.10-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Устанавливаем Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

# Копируем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь бэкенд (модели, скрипты)
COPY . /app/

ENV PORT=10000
EXPOSE 10000 11434

# Даем права на скрипт запуска
RUN chmod +x start.sh

CMD ["./start.sh"]
