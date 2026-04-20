"""
Parse raw HTML (or Firecrawl markdown-derived text) into the PDP-shaped dict
used across jobs and competitor verification.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

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


def looks_like_real_product(data: dict) -> bool:
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


def is_bot_challenge_page(data: dict) -> bool:
    """True when parsed fields look like a bot/WAF interstitial, not a real PDP."""
    if looks_like_real_product(data):
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


def _extract_ld_json(soup: BeautifulSoup) -> dict:
    """Pull structured data from JSON-LD blocks."""
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
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


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


_JUNK_OR_SECTION_H1 = re.compile(
    r"keyboard\s*shortcut|presents\s+key\s+product\s+information|"
    r"shift\s*\+\s*alt|amazon-adsystem|\.com\s+is\s+blocked",
    re.I,
)

_GENERIC_SECTION_H1 = frozenset(
    {
        "about this item",
        "product information",
        "product details",
        "customer reviews",
        "from the manufacturer",
        "important information",
        "safety information",
    }
)


def _skip_h1_heading(text: str) -> bool:
    t = clean_text(text)
    if len(t) < 4:
        return True
    low = t.lower()
    if low in _GENERIC_SECTION_H1:
        return True
    if _JUNK_OR_SECTION_H1.search(t):
        return True
    return False


def _best_h1_title(soup: BeautifulSoup) -> str:
    """Prefer the first substantive product heading (Amazon puts a11y text in the first h1)."""
    for h in soup.find_all("h1"):
        t = clean_text(h.get_text(separator=" ", strip=True))
        if t and not _skip_h1_heading(t):
            return t
    return ""


def _document_title_fallback(soup: BeautifulSoup) -> str:
    if not soup.title or not soup.title.string:
        return ""
    return clean_text(str(soup.title.string))[:500]


def _valid_embedded_barcode(d: str) -> bool:
    if not d:
        return False
    ln = len(d)
    return ln in (8, 12, 13, 14) and ln not in (10, 11)


_JSON_GTIN_KEY = re.compile(
    r"gtin|upc|ean|barcode|external[_-]?product|product[_-]?identifier", re.I
)


def _walk_json_for_gtin_values(obj: Any, out: set[str], depth: int = 0) -> None:
    if depth > 35:
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            ks = str(k)
            if _JSON_GTIN_KEY.search(ks) and isinstance(v, (str, int, float)):
                d = re.sub(r"\D", "", str(v))
                if _valid_embedded_barcode(d):
                    out.add(d)
            elif isinstance(v, (dict, list)):
                _walk_json_for_gtin_values(v, out, depth + 1)
    elif isinstance(obj, list):
        for item in obj[:400]:
            _walk_json_for_gtin_values(item, out, depth + 1)


def _extract_embedded_gtins(html: str, soup: BeautifulSoup) -> set[str]:
    out: set[str] = set()
    if not html:
        return out
    chunk = html[: min(len(html), 1_200_000)]

    kv_patterns = (
        re.compile(
            r'["\'](?:gtin|GTIN|gtin14|gtin13|gtin12|gtin8|upc|UPC|ean|EAN)["\']'
            r"\s*:\s*['\"]?(\d{8,14})['\"]?(?=\s*[,}\]])",
            re.I,
        ),
        re.compile(
            r'\\["\'](?:gtin|GTIN|gtin14|gtin13|gtin12|gtin8|upc|UPC|ean|EAN)\\["\']'
            r"\s*:\s*\\?['\"]?(\d{8,14})\\?['\"]?",
            re.I,
        ),
    )
    for pat in kv_patterns:
        for m in pat.finditer(chunk):
            d = m.group(1)
            if _valid_embedded_barcode(d):
                out.add(d)

    for script in soup.find_all("script"):
        src = script.string or script.get_text() or ""
        if len(src) < 80:
            continue
        for pat in kv_patterns:
            for m in pat.finditer(src):
                d = m.group(1)
                if _valid_embedded_barcode(d):
                    out.add(d)
        stripped = src.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                _walk_json_for_gtin_values(json.loads(stripped), out)
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    return out


def parse_html(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")

    ld = _extract_ld_json(soup)
    ld_offers = ld.get("offers", {})
    if isinstance(ld_offers, list):
        ld_offers = ld_offers[0] if ld_offers else {}

    title = (
        ld.get("name")
        or _extract_meta(soup, "og:title")
        or _best_h1_title(soup)
        or _document_title_fallback(soup)
        or ""
    )

    description = (
        ld.get("description")
        or _extract_meta(soup, "og:description")
        or _extract_meta(soup, "description")
        or ""
    )

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
    if not str(price).strip():
        for el in soup.select(".a-price .a-offscreen"):
            t = clean_text(el.get_text())
            if t and re.search(r"\d", t):
                price = t
                break

    attributes: dict[str, str] = {}

    for prop in ld.get("additionalProperty", []):
        k = prop.get("name", "").strip()
        v = prop.get("value", "")
        if isinstance(v, list):
            v = ", ".join(str(x) for x in v)
        if k:
            attributes[k] = str(v).strip()

    for schema_key in ("gtin14", "gtin13", "gtin12", "gtin8", "gtin"):
        val = ld.get(schema_key)
        if val and str(val).strip():
            attributes.setdefault("GTIN", str(val).strip())
            break
    for schema_key, label in (("sku", "SKU"), ("mpn", "MPN")):
        val = ld.get(schema_key)
        if val and str(val).strip():
            attributes.setdefault(label, str(val).strip())

    # Many retailers (e.g. Office Depot) put brand only in JSON-LD, not in
    # additionalProperty or a matched spec table — competitor matching keys on "Brand".
    brand_val = ld.get("brand")
    if brand_val:
        if isinstance(brand_val, dict):
            name = brand_val.get("name")
            if name and str(name).strip():
                attributes.setdefault("Brand", str(name).strip())
        elif isinstance(brand_val, str) and brand_val.strip():
            attributes.setdefault("Brand", brand_val.strip())
    mfr = ld.get("manufacturer")
    if mfr and "Brand" not in attributes:
        if isinstance(mfr, dict):
            name = mfr.get("name")
            if name and str(name).strip():
                attributes.setdefault("Manufacturer", str(name).strip())
        elif isinstance(mfr, str) and mfr.strip():
            attributes.setdefault("Manufacturer", mfr.strip())

    spec_selectors = [
        "table.prodDetTable",
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
                    k = clean_text(cells[0].get_text())
                    v = clean_text(cells[1].get_text())
                    if k and v:
                        attributes[k] = v
            break

    if not attributes:
        for dl in soup.find_all("dl"):
            terms = dl.find_all("dt")
            defs = dl.find_all("dd")
            for dt, dd in zip(terms, defs):
                k = clean_text(dt.get_text())
                v = clean_text(dd.get_text())
                if k and v:
                    attributes[k] = v

    images: list[str] = []
    og_img = _extract_meta(soup, "og:image")
    if og_img:
        images.append(og_img)
    for img_tag in soup.find_all("img", src=True)[:10]:
        src = img_tag["src"]
        if src and not src.startswith("data:") and src not in images:
            images.append(src)

    try:
        embedded = _extract_embedded_gtins(html, soup)
        for idx, g in enumerate(sorted(embedded)):
            key = "GTIN (embedded)" if idx == 0 else f"GTIN (embedded {idx + 1})"
            attributes[key] = g
    except Exception:
        logger.debug("embedded GTIN extraction failed for %s", url, exc_info=True)

    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    raw_text = clean_text(soup.get_text(separator=" "))[:6000]

    return {
        "url": url,
        "title": clean_text(str(title)),
        "description": clean_text(str(description))[:2000],
        "price": str(price),
        "attributes": attributes,
        "images": images[:5],
        "raw_text": raw_text,
        "error": None,
    }


def has_useful_pdp_content(data: dict) -> bool:
    return bool(data.get("title")) or len(data.get("attributes") or {}) > 0


def sanitize_blocked_pdp(url: str, data: dict) -> dict:
    """Strip misleading interstitial text so prompts/models do not ingest it."""
    if not is_bot_challenge_page(data):
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
    if is_bot_challenge_page(data):
        return False
    if has_useful_pdp_content(data):
        return True
    raw = data.get("raw_text") or ""
    return len(raw) > 400
