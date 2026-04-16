from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routers import customers, prompts, ai_models, jobs
from seed import seed

# Create tables
models.Base.metadata.create_all(bind=engine)

# Seed initial data
seed()

app = FastAPI(
    title="PDP Runner",
    description="Run AI prompts against eCommerce Product Detail Pages",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers.router, prefix="/api")
app.include_router(prompts.router, prefix="/api")
app.include_router(ai_models.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "PDP Runner"}
