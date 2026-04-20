"""Firecrawl remote scrape transport."""
from __future__ import annotations

import logging
from typing import Any, cast
from urllib.parse import urlparse

from config import get_settings
from services.scraping.pdp_parse import clean_text, parse_html

logger = logging.getLogger(__name__)


def _firecrawl_scrape_actions() -> list[dict[str, Any]]:
    s = get_settings()
    if not s.FIRECRAWL_ENABLE_SCROLL_ACTIONS:
        return []
    return [
        {"type": "scroll", "direction": "down"},
        {"type": "wait", "milliseconds": s.FIRECRAWL_ACTION_WAIT_MS},
    ]


def _url_path_looks_like_pdf(url: str) -> bool:
    try:
        path = urlparse(url).path or ""
    except Exception:
        return False
    return path.lower().endswith(".pdf")


def _firecrawl_actions_for_url(url: str) -> list[dict[str, Any]]:
    """Scroll actions need Fire Engine; skip for PDFs (unsupported / pointless)."""
    if _url_path_looks_like_pdf(url):
        return []
    return _firecrawl_scrape_actions()


def _firecrawl_error_suggests_retry_without_actions(msg: str) -> bool:
    m = (msg or "").lower()
    if "fire engine" in m or "fire-engine" in m:
        return True
    return "actions" in m and "not supported" in m


def metadata_title_description(doc: Any) -> tuple[str, str]:
    """Read title/description from Firecrawl Document metadata (snake_case or camelCase)."""
    meta: dict[str, Any] = {}
    try:
        meta = cast(dict[str, Any], doc.metadata_dict)
    except Exception:
        pass
    if not meta:
        md = getattr(doc, "metadata", None)
        if isinstance(md, dict):
            meta = md
        elif md is not None and hasattr(md, "model_dump"):
            meta = md.model_dump()

    def _one(val: Any) -> str:
        if val is None:
            return ""
        if isinstance(val, list):
            val = val[0] if val else ""
        return clean_text(str(val))

    title = _one(
        meta.get("title")
        or meta.get("ogTitle")
        or meta.get("og_title")
    )[:500]
    description = _one(
        meta.get("description")
        or meta.get("ogDescription")
        or meta.get("og_description")
    )[:2000]
    return title, description


def pdp_from_firecrawl_document(url: str, doc: Any) -> dict:
    """Firecrawl sometimes returns markdown without HTML; still produce PDP context."""
    md = (getattr(doc, "markdown", None) or "").strip()
    title, description = metadata_title_description(doc)
    if not title and md:
        title = clean_text(md.split("\n", 1)[0])[:500]
    raw_text = clean_text(md)[:6000] if md else ""
    return {
        "url": url,
        "title": title,
        "description": description,
        "price": "",
        "attributes": {},
        "images": [],
        "raw_text": raw_text,
        "error": None,
    }


async def fetch_with_firecrawl(url: str, api_key: str) -> dict:
    """
    Remote scrape via official Firecrawl Python SDK (AsyncFirecrawl).
    Prefer raw_html (keeps JSON-LD); fall back to html, then markdown + metadata.
    """
    try:
        from firecrawl import AsyncFirecrawl
    except ImportError:
        return {
            "url": url,
            "title": None,
            "description": None,
            "price": None,
            "attributes": {},
            "images": [],
            "raw_text": None,
            "error": "Firecrawl: firecrawl-py is not installed",
        }

    empty = {
        "url": url,
        "title": None,
        "description": None,
        "price": None,
        "attributes": {},
        "images": [],
        "raw_text": None,
        "error": None,
    }

    s = get_settings()

    async def _do_scrape(actions: list[dict[str, Any]]) -> Any:
        client = AsyncFirecrawl(
            api_key=api_key, timeout=s.FIRECRAWL_CLIENT_TIMEOUT_MS / 1000.0
        )
        scroll_actions = len(actions) > 0
        action_wait_ms = s.FIRECRAWL_ACTION_WAIT_MS if scroll_actions else 0
        logger.info(
            "pdp.firecrawl: scrape start url=%s max_age_ms=%s wait_for_ms=%s "
            "timeout_ms=%s client_timeout_ms=%s proxy=%s scroll_actions=%s "
            "action_wait_ms=%s formats=rawHtml,html,markdown only_main_content=false",
            url,
            s.FIRECRAWL_MAX_AGE_MS,
            s.FIRECRAWL_WAIT_FOR_MS,
            s.FIRECRAWL_TIMEOUT_MS,
            s.FIRECRAWL_CLIENT_TIMEOUT_MS,
            (s.FIRECRAWL_PROXY or "auto").strip() or "auto",
            scroll_actions,
            action_wait_ms,
        )
        return await client.scrape(
            url,
            formats=["rawHtml", "html", "markdown"],
            only_main_content=False,
            max_age=s.FIRECRAWL_MAX_AGE_MS,
            wait_for=s.FIRECRAWL_WAIT_FOR_MS,
            actions=actions,
            proxy=(s.FIRECRAWL_PROXY or "auto").strip() or "auto",
            timeout=s.FIRECRAWL_TIMEOUT_MS,
        )

    actions = _firecrawl_actions_for_url(url)

    try:
        doc = await _do_scrape(actions)
    except Exception as exc:
        err_s = str(exc)
        if (
            actions
            and _firecrawl_error_suggests_retry_without_actions(err_s)
        ):
            logger.info(
                "pdp.firecrawl: retry without actions (Fire Engine not available?) url=%s",
                url,
            )
            try:
                doc = await _do_scrape([])
            except Exception as exc2:
                logger.warning("pdp.firecrawl: failed url=%s err=%s", url, exc2)
                return {**empty, "error": f"Firecrawl: {exc2}"}
        else:
            logger.warning("pdp.firecrawl: failed url=%s err=%s", url, exc)
            return {**empty, "error": f"Firecrawl: {exc}"}

    try:
        html = (doc.raw_html or doc.html or "").strip()
        if html:
            logger.info(
                "pdp.firecrawl: ok html url=%s bytes=%s", url, len(html.encode("utf-8"))
            )
            return parse_html(url, html)
        md = (getattr(doc, "markdown", None) or "").strip()
        if md:
            logger.info("pdp.firecrawl: ok markdown-only url=%s", url)
            return pdp_from_firecrawl_document(url, doc)
        logger.warning("pdp.firecrawl: empty html+markdown url=%s", url)
        return {**empty, "error": "Firecrawl: empty HTML and markdown in response"}
    except Exception as exc:
        logger.warning("pdp.firecrawl: failed url=%s err=%s", url, exc)
        return {**empty, "error": f"Firecrawl: {exc}"}
