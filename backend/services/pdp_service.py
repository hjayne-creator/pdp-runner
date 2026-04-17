"""
PDP scraping service.
Attempts a lightweight httpx fetch first; falls back to Playwright
for JavaScript-heavy pages; optionally uses Firecrawl when local scraping
fails (e.g. aggressive bot protection on shared hosting IPs).
"""
import json
import logging
import os
import re
from typing import Any, Optional, cast

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# Interstitials (Cloudflare, etc.) often return HTTP 200 with a non-empty title,
# which used to skip Playwright/Firecrawl and let the model echo block copy in JSON.
_CHALLENGE_TITLE_RE = re.compile(
    r"just\s+a\s+moment|attention\s+required|please\s+wait(?:\.\.\.)?|"
    r"verify\s+you\s+are\s+human|access\s+denied|bot\s+protection|"
    r"ddos\s+protection\s+by|checking\s+your\s+browser|"
    r"the\s+request\s+could\s+not\s+be\s+satisfied",
    re.I,
)


def _normalize_pdp_url(url: str) -> str:
    """Ensure scheme so httpx / Firecrawl / Playwright receive absolute URLs."""
    u = (url or "").strip()
    if not u:
        return u
    if not re.match(r"^https?://", u, re.I):
        u = f"https://{u}"
    return u


def _looks_like_real_product(data: dict) -> bool:
    """Strong PDP signals — do not treat as a bot wall (avoids Cloudflare footer false positives)."""
    price = str(data.get("price") or "")
    if re.search(r"\d", price):
        return True
    if len(data.get("attributes") or {}) >= 2:
        return True
    imgs = data.get("images") or []
    title = (data.get("title") or "").strip()
    if len(imgs) > 0 and len(title) > 24:
        return True
    return False


def _is_bot_challenge_page(data: dict) -> bool:
    """True when parsed fields look like a bot/WAF interstitial, not a real PDP."""
    if _looks_like_real_product(data):
        return False
    title = (data.get("title") or "").strip()
    if title and _CHALLENGE_TITLE_RE.search(title):
        return True
    raw = (data.get("raw_text") or "").lower()
    desc = (data.get("description") or "").lower()
    blob = f"{raw} {desc}"
    if "incapsula" in blob and "incident id" in blob:
        return True
    if "cloudflare" in blob or "cf-error" in blob:
        return any(
            marker in blob
            for marker in (
                "ray id",
                "checking your browser",
                "security block",
                "could not be retrieved",
                "turnstile",
                "just a moment",
                "activate and hold",
                "you have been blocked",
                "sorry, you have been blocked",
                "enable javascript and cookies",
                "ddos protection by",
                "why have i been blocked",
                "cloudflare security block",
                "due to a cloudflare",
            )
        )
    return False


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


def _extract_ld_json(soup: BeautifulSoup) -> dict:
    """Pull structured data from JSON-LD blocks."""
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
            # Support single object or array
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") in ("Product", "ItemPage"):
                    return item
        except (json.JSONDecodeError, AttributeError):
            continue
    return {}


def _extract_meta(soup: BeautifulSoup, name: str) -> Optional[str]:
    tag = (
        soup.find("meta", attrs={"property": name})
        or soup.find("meta", attrs={"name": name})
    )
    return tag.get("content", "").strip() if tag else None


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _parse_html(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")

    # ── JSON-LD structured data ──────────────────────────────────────────────
    ld = _extract_ld_json(soup)
    ld_offers = ld.get("offers", {})
    if isinstance(ld_offers, list):
        ld_offers = ld_offers[0] if ld_offers else {}

    # ── Title ────────────────────────────────────────────────────────────────
    title = (
        ld.get("name")
        or _extract_meta(soup, "og:title")
        or (soup.find("h1") and soup.find("h1").get_text(strip=True))
        or (soup.title and soup.title.string)
        or ""
    )

    # ── Description ──────────────────────────────────────────────────────────
    description = (
        ld.get("description")
        or _extract_meta(soup, "og:description")
        or _extract_meta(soup, "description")
        or ""
    )

    # ── Price ─────────────────────────────────────────────────────────────────
    price = (
        ld_offers.get("price")
        or _extract_meta(soup, "product:price:amount")
        or _extract_meta(soup, "og:price:amount")
        or ""
    )
    price_currency = (
        ld_offers.get("priceCurrency")
        or _extract_meta(soup, "product:price:currency")
        or "USD"
    )
    if price:
        price = f"{price_currency} {price}"

    # ── Attributes / Specs ────────────────────────────────────────────────────
    attributes: dict[str, str] = {}

    # JSON-LD additionalProperty
    for prop in ld.get("additionalProperty", []):
        k = prop.get("name", "").strip()
        v = prop.get("value", "")
        if isinstance(v, list):
            v = ", ".join(str(x) for x in v)
        if k:
            attributes[k] = str(v).strip()

    # Common spec table patterns
    spec_selectors = [
        "table.specifications", "table.specs", "table.product-specs",
        "#specifications table", "#specs table",
        "table[class*='spec']", "table[id*='spec']",
        ".product-attributes table", ".attributes table",
        "dl.product-attributes", "dl.specs",
    ]
    for sel in spec_selectors:
        table = soup.select_one(sel)
        if table:
            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    k = _clean_text(cells[0].get_text())
                    v = _clean_text(cells[1].get_text())
                    if k and v:
                        attributes[k] = v
            break

    # Definition lists
    if not attributes:
        for dl in soup.find_all("dl"):
            terms = dl.find_all("dt")
            defs = dl.find_all("dd")
            for dt, dd in zip(terms, defs):
                k = _clean_text(dt.get_text())
                v = _clean_text(dd.get_text())
                if k and v:
                    attributes[k] = v

    # ── Images ───────────────────────────────────────────────────────────────
    images: list[str] = []
    og_img = _extract_meta(soup, "og:image")
    if og_img:
        images.append(og_img)
    for img_tag in soup.find_all("img", src=True)[:10]:
        src = img_tag["src"]
        if src and not src.startswith("data:") and src not in images:
            images.append(src)

    # ── Raw text (truncated) ──────────────────────────────────────────────────
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    raw_text = _clean_text(soup.get_text(separator=" "))[:6000]

    return {
        "url": url,
        "title": _clean_text(str(title)),
        "description": _clean_text(str(description))[:2000],
        "price": str(price),
        "attributes": attributes,
        "images": images[:5],
        "raw_text": raw_text,
        "error": None,
    }


def _has_useful_pdp_content(data: dict) -> bool:
    return bool(data.get("title")) or len(data.get("attributes") or {}) > 0


def _sanitize_blocked_pdp(url: str, data: dict) -> dict:
    """Strip misleading interstitial text so prompts/models do not ingest it."""
    if not _is_bot_challenge_page(data):
        return data
    err = data.get("error") or (
        "Product page appears to be a bot-protection screen (e.g. Cloudflare) "
        "rather than real product content."
    )
    return {
        "url": url,
        "title": None,
        "description": None,
        "price": None,
        "attributes": {},
        "images": [],
        "raw_text": None,
        "error": err,
    }


def pdp_is_actionable(data: dict) -> bool:
    """False when we should not call the LLM (no real PDP context)."""
    if data.get("error"):
        return False
    if _is_bot_challenge_page(data):
        return False
    if _has_useful_pdp_content(data):
        return True
    raw = data.get("raw_text") or ""
    return len(raw) > 400


def blocked_analysis_json(reason: str) -> str:
    """Valid JSON matching the prompt output contract when the PDP cannot be loaded."""
    payload = {
        "product_summary": {
            "manufacturer": "",
            "manufacturer_part_number": "",
            "product_type": "",
            "revision_assessment": reason,
        },
        "accuracy_cleanup_fixes": [],
        "parametric_updates": [],
        "recommended_new_content_blocks": ["No new content blocks recommended"],
        "revised_overview_copy": "",
        "final_publishing_recommendation": (
            "Do not publish until source conflict is resolved"
        ),
        "sources": [],
    }
    return json.dumps(payload, indent=2)


async def fetch_pdp(url: str) -> dict:
    """Fetch and parse a PDP URL. Returns structured data dict."""
    url = _normalize_pdp_url(url)
    data = await _fetch_pdp_local(url)
    data = await _try_firecrawl_fallback(url, data)
    out = _sanitize_blocked_pdp(url, data)
    key = (os.environ.get("FIRECRAWL_API_KEY") or "").strip()
    if _is_bot_challenge_page(data) and not key:
        hint = (
            " Set FIRECRAWL_API_KEY on the server to enable the Firecrawl fallback."
        )
        if out.get("error") and hint not in out["error"]:
            out = {**out, "error": out["error"] + hint}
        elif not out.get("error"):
            out = {**out, "error": hint.strip()}
    return out


async def _fetch_pdp_local(url: str) -> dict:
    """httpx + BeautifulSoup, then Playwright when blocked or empty."""
    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=30.0,
        ) as client:
            resp = await client.get(url)

        # On bot-detection blocks (403, 429, 503) or redirect-loops go straight
        # to the headless browser instead of giving up.
        if resp.status_code in (403, 429, 503) or resp.status_code >= 500:
            return await _fetch_with_playwright(url)

        resp.raise_for_status()
        html = resp.text

        data = _parse_html(url, html)

        # Empty PDP or bot/WAF interstitial (often HTTP 200): try headless render.
        if not _has_useful_pdp_content(data) or _is_bot_challenge_page(data):
            data = await _fetch_with_playwright(url)

        return data

    except Exception as exc:
        pw = await _fetch_with_playwright(url)
        if pw.get("error"):
            base = {
                "url": url,
                "title": None,
                "description": None,
                "price": None,
                "attributes": {},
                "images": [],
                "raw_text": None,
                "error": str(exc),
            }
            base["error"] = f"{exc}; {pw['error']}"
            return base
        return pw


async def _try_firecrawl_fallback(url: str, data: dict) -> dict:
    """
    If FIRECRAWL_API_KEY is set and local scrape failed or returned no PDP
    signals, request rendered HTML from Firecrawl and re-parse.
    """
    key = (os.environ.get("FIRECRAWL_API_KEY") or "").strip()
    if not key:
        return data
    needs_firecrawl = (
        bool(data.get("error"))
        or not _has_useful_pdp_content(data)
        or _is_bot_challenge_page(data)
    )
    if not needs_firecrawl:
        return data

    fc = await _fetch_with_firecrawl(url, key)
    if not fc.get("error") and (
        _has_useful_pdp_content(fc)
        or (fc.get("raw_text") and len(fc["raw_text"]) > 200)
    ):
        return fc

    parts = [p for p in (data.get("error"), fc.get("error")) if p]
    if parts:
        data = {**data, "error": " | ".join(parts)}
    return data


def _metadata_title_description(doc: Any) -> tuple[str, str]:
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
        return _clean_text(str(val))

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


def _pdp_from_firecrawl_document(url: str, doc: Any) -> dict:
    """Firecrawl sometimes returns markdown without HTML; still produce PDP context."""
    md = (getattr(doc, "markdown", None) or "").strip()
    title, description = _metadata_title_description(doc)
    if not title and md:
        title = _clean_text(md.split("\n", 1)[0])[:500]
    raw_text = _clean_text(md)[:6000] if md else ""
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


async def _fetch_with_firecrawl(url: str, api_key: str) -> dict:
    """
    Remote scrape via official Firecrawl Python SDK (AsyncFirecrawl).
    Prefer raw_html (keeps JSON-LD); fall back to html, then markdown + metadata.
    See https://docs.firecrawl.dev/sdks/python
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

    try:
        client = AsyncFirecrawl(api_key=api_key, timeout=125.0)
        logger.info("pdp.firecrawl: scrape start url=%s", url)
        doc = await client.scrape(
            url,
            formats=["rawHtml", "html", "markdown"],
            only_main_content=False,
            max_age=172800000,
            proxy="auto",
            timeout=120000,
        )
        html = (doc.raw_html or doc.html or "").strip()
        if html:
            logger.info(
                "pdp.firecrawl: ok html url=%s bytes=%s", url, len(html.encode("utf-8"))
            )
            return _parse_html(url, html)
        md = (getattr(doc, "markdown", None) or "").strip()
        if md:
            logger.info("pdp.firecrawl: ok markdown-only url=%s", url)
            return _pdp_from_firecrawl_document(url, doc)
        logger.warning("pdp.firecrawl: empty html+markdown url=%s", url)
        return {**empty, "error": "Firecrawl: empty HTML and markdown in response"}
    except Exception as exc:
        logger.warning("pdp.firecrawl: failed url=%s err=%s", url, exc)
        return {**empty, "error": f"Firecrawl: {exc}"}


async def _fetch_with_playwright(url: str) -> dict:
    """Headless browser fallback for JS-rendered pages."""
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            page = await browser.new_page(extra_http_headers=HEADERS)
            # Mask navigator.webdriver so Cloudflare's bot detection sees a
            # real browser rather than a headless automation context.
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)
            html = await page.content()
            await browser.close()

        return _parse_html(url, html)
    except Exception as exc:
        return {
            "url": url,
            "title": None,
            "description": None,
            "price": None,
            "attributes": {},
            "images": [],
            "raw_text": None,
            "error": f"Playwright error: {exc}",
        }


def render_prompt(prompt_template: str, pdp_data: dict, url: str) -> str:
    """Replace template variables in a prompt with PDP data."""
    # Build a rich context block
    attrs_text = ""
    if pdp_data.get("attributes"):
        lines = [f"  {k}: {v}" for k, v in pdp_data["attributes"].items()]
        attrs_text = "\n".join(lines)

    context = f"""=== PRODUCT PAGE DATA ===
URL: {url}
Title: {pdp_data.get('title') or 'N/A'}
Price: {pdp_data.get('price') or 'N/A'}

Description:
{pdp_data.get('description') or 'N/A'}

Attributes/Specifications:
{attrs_text or 'N/A'}

Additional Page Content:
{pdp_data.get('raw_text') or 'N/A'}
========================="""

    # Replace known placeholders
    rendered = prompt_template
    placeholders = {
        "{{URL}}": url,
        "{{JAMECO_URL}}": url,
        "{{PDP_URL}}": url,
        "{{PRODUCT_URL}}": url,
        "{{TITLE}}": pdp_data.get("title") or "",
        "{{DESCRIPTION}}": pdp_data.get("description") or "",
        "{{PRICE}}": pdp_data.get("price") or "",
        "{{PDP_DATA}}": context,
        "{{PRODUCT_DATA}}": context,
    }
    for placeholder, value in placeholders.items():
        rendered = rendered.replace(placeholder, value)

    # Append full context if no placeholder was consumed
    if context not in rendered:
        rendered = rendered + f"\n\n{context}"

    # Add a deterministic output contract so a separate formatter step can
    # reliably render a clean HTML report from model output.
    rendered += """

=== OUTPUT CONTRACT ===
Return ONLY valid JSON (no markdown fences, no extra prose) with this exact shape:
{
  "product_summary": {
    "manufacturer": "string",
    "manufacturer_part_number": "string",
    "product_type": "string",
    "revision_assessment": "Light|Medium|Heavy with one sentence"
  },
  "accuracy_cleanup_fixes": [
    {
      "current_issue": "string",
      "correction": "string",
      "evidence_source": "url or source note"
    }
  ],
  "parametric_updates": [
    {
      "field": "string",
      "current_value": "string",
      "corrected_or_added_value": "string",
      "source": "url or source note",
      "confidence": "High|Medium|Low"
    }
  ],
  "recommended_new_content_blocks": [
    {
      "block_title": "string",
      "why_it_helps": "string",
      "source_basis": "string",
      "proposed_block_copy": "string"
    }
  ],
  "revised_overview_copy": "string",
  "final_publishing_recommendation": "Publish after light edit|Publish after human review|Do not publish until source conflict is resolved",
  "sources": ["https://..."]
}
If there are no new content blocks, return:
"recommended_new_content_blocks": ["No new content blocks recommended"]
=== END OUTPUT CONTRACT ===
"""

    return rendered
