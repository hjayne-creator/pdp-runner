# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:22-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first (layer cache)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build; vite.config.ts outputs to ../backend/static
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python backend ────────────────────────────────────────────────────
FROM python:3.12-slim

# Install system dependencies required by Playwright and lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (needed by the scraping service)
RUN playwright install --with-deps chromium

# Copy backend source
COPY backend/ ./

# Copy built frontend assets from Stage 1 into backend/static
COPY --from=frontend-builder /app/backend/static ./static

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
