"""
Scrape orchestration: Firecrawl-first with httpx/Playwright fallback where configured.
"""
from __future__ import annotations

import logging
import os

from config import ensure_backend_env_loaded
from services.scraping.firecrawl_client import fetch_with_firecrawl
from services.scraping.local_client import fetch_pdp_local
from services.scraping.pdp_parse import (
    has_useful_pdp_content,
    is_bot_challenge_page,
    sanitize_blocked_pdp,
)
from services.scraping.urlutil import normalize_pdp_url

logger = logging.getLogger(__name__)


def _firecrawl_api_key() -> str:
    """API key from the environment after ``.env`` has been applied (avoids stale cache)."""
    return (os.environ.get("FIRECRAWL_API_KEY") or "").strip()


def firecrawl_fetch_looks_usable(data: dict) -> bool:
    if data.get("error"):
        return False
    if is_bot_challenge_page(data):
        return False
    if has_useful_pdp_content(data):
        return True
    return bool(data.get("raw_text") and len(data["raw_text"]) > 200)


async def fetch_pdp(url: str) -> dict:
    """Fetch and parse a PDP URL. Returns structured data dict."""
    ensure_backend_env_loaded()
    url = normalize_pdp_url(url)
    key = _firecrawl_api_key()
    if key:
        data = await fetch_with_firecrawl(url, key)
        if not firecrawl_fetch_looks_usable(data):
            local = await fetch_pdp_local(url)
            if firecrawl_fetch_looks_usable(local):
                data = local
            else:
                parts = [p for p in (data.get("error"), local.get("error")) if p]
                data = local
                if parts:
                    data = {**data, "error": " | ".join(parts)}
    else:
        data = await fetch_pdp_local(url)
    out = sanitize_blocked_pdp(url, data)
    if is_bot_challenge_page(data) and not key:
        hint = (
            " Set FIRECRAWL_API_KEY on the server to enable Firecrawl scraping."
        )
        if out.get("error") and hint not in out["error"]:
            out = {**out, "error": out["error"] + hint}
        elif not out.get("error"):
            out = {**out, "error": hint.strip()}
    return out


async def fetch_pdp_without_firecrawl(url: str) -> dict:
    """
    httpx + Playwright only (no Firecrawl). Used when the Firecrawl SDK or key
    is unavailable but a PDP-shaped dict is still needed (e.g. competitor URLs).

    Sets ``scrape_source`` to ``httpx_playwright`` for audit trails (this path
    does not use Firecrawl's remote JS fetch).
    """
    ensure_backend_env_loaded()
    url = normalize_pdp_url(url)
    data = await fetch_pdp_local(url)
    out = sanitize_blocked_pdp(url, data)
    return {**out, "scrape_source": "httpx_playwright"}


async def scrape_url_with_firecrawl(url: str) -> dict:
    """
    Scrape a single URL for competitor verification.

    Prefer Firecrawl when ``FIRECRAWL_API_KEY`` and ``firecrawl-py`` are available.
    If Firecrawl returns an unusable PDP (same heuristics as ``fetch_pdp``), fall
    back to httpx + Playwright. Otherwise fall back when the key or SDK is missing.
    """
    ensure_backend_env_loaded()
    url = normalize_pdp_url(url)
    key = _firecrawl_api_key()
    if not key:
        logger.info(
            "pdp.scrape_url_with_firecrawl: no FIRECRAWL_API_KEY; local fetch url=%s",
            url,
        )
        return await fetch_pdp_without_firecrawl(url)

    try:
        from firecrawl import AsyncFirecrawl  # noqa: F401
    except ImportError:
        logger.warning(
            "firecrawl-py not installed; using httpx/Playwright for url=%s", url
        )
        return await fetch_pdp_without_firecrawl(url)

    logger.info("pdp.scrape_url_with_firecrawl: attempting Firecrawl url=%s", url)
    result = await fetch_with_firecrawl(url, key)
    err = (result.get("error") or "").lower()
    if "not installed" in err or "firecrawl-py" in err:
        logger.warning(
            "Firecrawl unavailable (%s); using httpx/Playwright for url=%s",
            result.get("error"),
            url,
        )
        return await fetch_pdp_without_firecrawl(url)

    if firecrawl_fetch_looks_usable(result):
        return {**result, "scrape_source": "firecrawl"}

    local = await fetch_pdp_without_firecrawl(url)
    if firecrawl_fetch_looks_usable(local):
        logger.info(
            "pdp.scrape_url_with_firecrawl: Firecrawl weak/unusable; using local url=%s",
            url,
        )
        return local

    parts = [p for p in (result.get("error"), local.get("error")) if p]
    merged = {**local}
    if parts:
        merged = {**merged, "error": " | ".join(parts)}
    return merged
