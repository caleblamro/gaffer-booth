# --- frontend ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- api ---
FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY pyproject.toml ./
COPY booth/ booth/
RUN pip install .
COPY --from=web /web/dist web/dist
EXPOSE 8000
CMD ["uvicorn", "booth.server:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
