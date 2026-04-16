# PDP Prompt Runner

Run AI prompts against eCommerce Product Detail Pages. Built for DynEcom's PDP audit and enrichment workflow.

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI + SQLite (SQLAlchemy) |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| AI | OpenAI + Anthropic (streaming SSE) |
| Scraping | httpx + BeautifulSoup + Playwright fallback |

---

## Quick Start

### 1. Backend

```bash
cd backend

# Create venv + install
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Optional: install Playwright browser
playwright install chromium

# Configure API keys
cp .env.example .env
# Edit .env with your OPENAI_API_KEY and/or ANTHROPIC_API_KEY

# Start server (auto-seeds DB on first run)
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## Usage

1. **Run Analysis** — Enter a PDP URL, pick Customer → Prompt → Model, click "Run Analysis"
2. **Job History** — Review past runs with full output, rendered prompt, and raw PDP data
3. **Admin** — Manage customers, prompts (with versioning), and AI models

---

## Prompt Placeholders

In prompt content, use these variables — they are replaced at runtime:

| Placeholder | Replaced with |
|---|---|
| `{{URL}}` / `{{JAMECO_URL}}` / `{{PDP_URL}}` | The input product URL |
| `{{TITLE}}` | Extracted product title |
| `{{DESCRIPTION}}` | Extracted product description |
| `{{PRICE}}` | Extracted price |
| `{{PDP_DATA}}` / `{{PRODUCT_DATA}}` | Full structured PDP context block |

If no placeholder is consumed, the full PDP context is appended automatically.

---

## Adding AI Models

In **Admin → AI Models**, add a new entry with:

- **Provider**: `openai` or `anthropic`
- **Model ID**: the exact API identifier (e.g. `gpt-4o`, `claude-opus-4-5`)
- **Max Tokens**: output token limit

API keys are read from `.env` (or can be set per-model in the `config` JSON field).

---

## Project Structure

```
PDP-Prompt/
├── backend/
│   ├── main.py           # FastAPI app + startup
│   ├── models.py         # SQLAlchemy ORM models
│   ├── schemas.py        # Pydantic schemas
│   ├── database.py       # DB connection
│   ├── seed.py           # Initial data (Jameco + models)
│   ├── routers/
│   │   ├── customers.py
│   │   ├── prompts.py
│   │   ├── ai_models.py
│   │   └── jobs.py       # SSE streaming job runner
│   └── services/
│       ├── pdp_service.py   # Scraping + prompt rendering
│       └── ai_service.py    # OpenAI / Anthropic streaming
└── frontend/
    └── src/
        ├── api/           # Type-safe API client
        ├── components/    # Layout, Modal
        └── pages/
            ├── RunnerPage.tsx
            ├── HistoryPage.tsx
            └── AdminPage.tsx
```
