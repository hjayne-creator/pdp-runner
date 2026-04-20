"""
Central environment loading and typed settings.

``ensure_backend_env_loaded()`` loads ``backend/.env`` once (cwd-independent).
``get_settings()`` returns cached Pydantic settings (includes Firecrawl scrape knobs).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parent
_ENV_FILE = _BACKEND_ROOT / ".env"

_env_loaded = False


def ensure_backend_env_loaded() -> None:
    """Populate ``os.environ`` from ``backend/.env`` so legacy ``os.getenv`` callers work."""
    global _env_loaded
    if _env_loaded:
        return
    # Default dotenv behavior does not override existing keys — empty placeholders
    # from the host (e.g. ``FIRECRAWL_API_KEY=``) would block values from ``.env``.
    load_dotenv(_ENV_FILE, override=True)
    get_settings.cache_clear()
    _env_loaded = True


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    FIRECRAWL_API_KEY: str = ""
    FIRECRAWL_MAX_AGE_MS: int = Field(default=172800000, ge=0)
    FIRECRAWL_WAIT_FOR_MS: int = Field(default=3000, ge=0)
    FIRECRAWL_TIMEOUT_MS: int = Field(default=120000, ge=1000)
    FIRECRAWL_CLIENT_TIMEOUT_MS: int = Field(default=125000, ge=1000)
    FIRECRAWL_PROXY: str = "auto"
    # Scroll/wait actions need Fire Engine on the Firecrawl account; default off.
    FIRECRAWL_ENABLE_SCROLL_ACTIONS: bool = False
    FIRECRAWL_ACTION_WAIT_MS: int = Field(default=2000, ge=0)


@lru_cache
def get_settings() -> Settings:
    ensure_backend_env_loaded()
    s = Settings()
    if s.FIRECRAWL_CLIENT_TIMEOUT_MS < s.FIRECRAWL_TIMEOUT_MS:
        return s.model_copy(
            update={"FIRECRAWL_CLIENT_TIMEOUT_MS": s.FIRECRAWL_TIMEOUT_MS}
        )
    return s
