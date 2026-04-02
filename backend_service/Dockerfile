# Используем Python 3.10 slim
FROM python:3.10-slim

# Устанавливаем необходимые утилиты
RUN apt-get update && \
    apt-get install -y curl zstd && \
    rm -rf /var/lib/apt/lists/*

# Устанавливаем Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Рабочая директория
WORKDIR /app

# Копируем и устанавливаем зависимости Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . /app/

# Делаем скрипт запуска исполняемым
RUN chmod +x start.sh

# Переменная окружения для FastAPI
ENV PORT=10000

# Порты
EXPOSE 10000 11434

# Стартовый скрипт
CMD ["./start.sh"]
