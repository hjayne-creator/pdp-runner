"""
PDP scraping service.
Attempts a lightweight httpx fetch first; falls back to Playwright
for JavaScript-heavy pages.
"""
import re
import json
from typing import Optional
import httpx
from bs4 import BeautifulSoup


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


async def fetch_pdp(url: str) -> dict:
    """Fetch and parse a PDP URL. Returns structured data dict."""
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

        # If we got almost nothing useful, try playwright
        has_content = bool(data["title"]) or len(data["attributes"]) > 0
        if not has_content:
            data = await _fetch_with_playwright(url)

        return data

    except Exception as exc:
        return {
            "url": url,
            "title": None,
            "description": None,
            "price": None,
            "attributes": {},
            "images": [],
            "raw_text": None,
            "error": str(exc),
        }


async def _fetch_with_playwright(url: str) -> dict:
    """Headless browser fallback for JS-rendered pages."""
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(extra_http_headers=HEADERS)
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
