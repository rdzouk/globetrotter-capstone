# Itinerary Service — owns trip planning and reviews
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5002

ENV PORT=5002

CMD ["python", "app.py"]
