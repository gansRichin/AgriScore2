FROM python:3.10-slim

# 1. Установка системных зависимостей
RUN apt-get update && apt-get install -y curl zstd && rm -rf /var/lib/apt/lists/*

# 2. Установка Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# 3. Работаем в директории приложения
WORKDIR /app

# 4. Копируем зависимости и устанавливаем
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Копируем весь бэкенд
COPY . /app/

# 6. Настройка портов и переменной окружения
ENV PORT=10000
EXPOSE 10000 11434

# 7. Даем права на скрипт запуска
RUN chmod +x start.sh

# 8. Запуск контейнера через скрипт
CMD ["./start.sh"]