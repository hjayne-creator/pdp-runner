import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, ensure_schema
import models
from routers import customers, prompts, ai_models, jobs, report_templates
from seed import seed

# Create tables
models.Base.metadata.create_all(bind=engine)
ensure_schema()

# Seed initial data
seed()

app = FastAPI(
    title="PDP Runner",
    description="Run AI prompts against eCommerce Product Detail Pages",
    version="1.0.0",
)

_DEFAULT_ORIGINS = [
    "https://pdp-runner-production.up.railway.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

# ALLOWED_ORIGINS env var accepts a comma-separated list of origins.
# Falls back to the defaults above when not set.
_env_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else _DEFAULT_ORIGINS
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers.router, prefix="/api")
app.include_router(prompts.router, prefix="/api")
app.include_router(ai_models.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(report_templates.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "PDP Runner"}


# Serve React frontend static files (production build)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/favicon.svg")
    def favicon():
        return FileResponse(os.path.join(STATIC_DIR, "favicon.svg"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Catch-all: serve index.html for all non-API routes (SPA client-side routing)."""
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
