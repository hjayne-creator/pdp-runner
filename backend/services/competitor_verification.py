"""
Discover competitor PDP URLs via SerpAPI (Google, US English), scrape candidates
with Firecrawl, verify exact-match signals against the subject PDP, and build
prompt context plus a JSON audit trail.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from config import ensure_backend_env_loaded
from services.pdp_service import scrape_url_with_firecrawl

logger = logging.getLogger(__name__)

MAX_CANDIDATES = 12
MAX_VERIFIED = 5
SERP_NUM = 15
SERP_TIMEOUT = 45.0
SCRAPE_TIMEOUT = 125.0
SCRAPE_CONCURRENCY = 5

_BLOCKED_HOST_SNIPPETS = (
    "ebay.",
    "etsy.",
    "facebook.",
    "pinterest.",
    "instagram.",
    "twitter.",
    "x.com",
    "tiktok.",
    "google.com/shopping",
    "youtube.",
    "maps.google",
    "shopping.com",
    "upcitemdb.com",
)

_GTIN_KEY = re.compile(
    r"gtin|upc|ean|barcode|isbn|product\s*id|global\s*trade", re.I
)
_MPN_KEY = re.compile(
    r"\bmpn\b|manufacturer\s*part|mfr\.?\s*part|part\s*#|model\s*#|"
    r"item\s*#|oem|supplier\s*sku|vendor\s*sku|manufacturer\s*series|"
    r"series|family|model$|product\s*code|code$",
    re.I,
)
_BRAND_KEY = re.compile(
    r"^brand(\s+name)?$|^manufacturer$|^make$|^mfr$|^vendor$",
    re.I,
)


def _host_key(url: str) -> str:
    try:
        h = (urlparse(url).netloc or "").lower()
        if h.startswith("www."):
            h = h[4:]
        return h
    except Exception:
        return ""


def _norm_mpn(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _norm_brand(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _digits_only(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _gtin_check_digit(body: str) -> int:
    """
    Compute GTIN check digit for body lengths 7/11/12/13.
    """
    total = 0
    for i, ch in enumerate(reversed(body), start=1):
        total += int(ch) * (3 if i % 2 == 1 else 1)
    return (10 - (total % 10)) % 10


def _is_valid_gtin(d: str) -> bool:
    """
    Strict GTIN validation: allowed lengths + check-digit verification.
    """
    if not _valid_gtin_length(d):
        return False
    body, check = d[:-1], d[-1]
    if not body or not check.isdigit():
        return False
    return _gtin_check_digit(body) == int(check)


def _collect_gtin_codes(pdp_data: dict) -> set[str]:
    codes: set[str] = set()
    attrs = pdp_data.get("attributes") or {}

    for k, v in attrs.items():
        if not v:
            continue
        vs = str(v).strip()
        if _GTIN_KEY.search(k):
            d = _digits_only(vs)
            if _is_valid_gtin(d):
                codes.add(d)
        elif vs.isdigit() and _is_valid_gtin(vs):
            codes.add(vs)

    for blob in (
        pdp_data.get("title") or "",
        pdp_data.get("description") or "",
        pdp_data.get("raw_text") or "",
    ):
        for m in re.finditer(r"\b(\d{12}|\d{13}|\d{14}|\d{8})\b", blob):
            d = m.group(1)
            if _is_valid_gtin(d):
                codes.add(d)
    return codes


def _valid_gtin_length(d: str) -> bool:
    if not d:
        return False
    ln = len(d)
    return ln in (8, 12, 13, 14) and ln not in (10, 11)


def _collect_mpns(pdp_data: dict) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    attrs = pdp_data.get("attributes") or {}
    for k, v in attrs.items():
        if not v or not _MPN_KEY.search(k):
            continue
        n = _norm_mpn(str(v))
        if len(n) >= 3 and n not in seen:
            seen.add(n)
            out.append(n)

    # Fallback: extract model-like tokens from prominent text fields.
    # This recovers common identifiers like "LRS-150F-12" that may appear
    # only in URL/title and not under strict MPN attribute keys.
    blobs = [
        pdp_data.get("title") or "",
        pdp_data.get("url") or "",
        pdp_data.get("raw_text") or "",
    ]
    for blob in blobs:
        if not blob:
            continue
        for m in re.finditer(
            r"\b(?=[A-Za-z0-9-]{6,})(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)"
            r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,5}\b",
            str(blob),
        ):
            tok = m.group(0)
            n = _norm_mpn(tok)
            if len(n) >= 6 and n not in seen:
                seen.add(n)
                out.append(n)
    return out


def _relaxed_mpn(s: str) -> str:
    """
    Relaxed model normalization for light variant-letter tolerance.
    Example: LRS-150F-12 -> lrs15012.
    """
    n = _norm_mpn(s)
    if not n:
        return ""
    return re.sub(r"(?<=\d)[a-z](?=\d)", "", n)


def _collect_brands(pdp_data: dict) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    attrs = pdp_data.get("attributes") or {}
    for k, v in attrs.items():
        if not v or not _BRAND_KEY.search(k.strip()):
            continue
        b = _norm_brand(str(v))
        if len(b) >= 2 and b not in seen:
            seen.add(b)
            out.append(b)
    return out


def extract_subject_identity(pdp_data: dict) -> dict[str, Any]:
    """Structured identifiers used for search and verification."""
    gtins = sorted(_collect_gtin_codes(pdp_data))
    mpns = _collect_mpns(pdp_data)
    brands = _collect_brands(pdp_data)
    return {
        "gtins": gtins,
        "mpns": mpns,
        "brands": brands,
    }


def _build_queries(pdp_data: dict, identity: dict[str, Any], limit: int = 4) -> list[str]:
    queries: list[str] = []
    gtins = identity.get("gtins") or []
    mpns = identity.get("mpns") or []
    brands = identity.get("brands") or []

    for g in gtins[:2]:
        if g:
            queries.append(g)
    if mpns and brands:
        queries.append(f"{brands[0]} {mpns[0]}")
    elif mpns:
        queries.append(mpns[0])
    title = (pdp_data.get("title") or "").strip()
    if title:
        words = title.split()[:10]
        if len(words) >= 3:
            queries.append(" ".join(words))

    seen: set[str] = set()
    out: list[str] = []
    for q in queries:
        qn = (q or "").strip()
        if len(qn) < 3 or qn in seen:
            continue
        seen.add(qn)
        out.append(qn)
        if len(out) >= limit:
            break
    return out


def _url_allowed(link: str, subject_host: str) -> bool:
    if not link or not link.startswith("http"):
        return False
    low = link.lower()
    if any(b in low for b in _BLOCKED_HOST_SNIPPETS):
        return False
    try:
        host = _host_key(link)
        if not host:
            return False
        if subject_host and host == subject_host:
            return False
        if "google.com" in host and "/url" in low:
            return False
    except Exception:
        return False
    return True


async def _serp_organic_links(query: str, api_key: str) -> list[str]:
    params = {
        "engine": "google",
        "q": query,
        "api_key": api_key,
        "hl": "en",
        "gl": "us",
        "num": str(SERP_NUM),
    }
    async with httpx.AsyncClient(timeout=SERP_TIMEOUT) as client:
        resp = await client.get("https://serpapi.com/search.json", params=params)
        resp.raise_for_status()
        data = resp.json()
    organic = data.get("organic_results") or []
    links: list[str] = []
    for row in organic:
        link = (row.get("link") or "").strip()
        if link:
            links.append(link)
    return links


def _merge_candidate_urls(
    queries_run: list[dict[str, Any]],
    subject_host: str,
) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for block in queries_run:
        for link in block.get("urls", []):
            if not _url_allowed(link, subject_host):
                continue
            low = link.split("#", 1)[0].rstrip("/")
            if low in seen:
                continue
            seen.add(low)
            ordered.append(link)
            if len(ordered) >= MAX_CANDIDATES:
                return ordered
    return ordered


def _verify_candidate(
    subject_gtins: set[str],
    subject_mpns: list[str],
    subject_brands: list[str],
    cand: dict,
) -> tuple[bool, str]:
    c_gt = _collect_gtin_codes(cand)
    if subject_gtins and c_gt and (subject_gtins & c_gt):
        return True, "gtin_match"

    c_mpns = _collect_mpns(cand)
    if subject_mpns and c_mpns:
        sm_set = set(subject_mpns)
        cm_set = set(c_mpns)
        m_ok = bool(sm_set & cm_set)
        if not m_ok:
            sm_rel = {_relaxed_mpn(x) for x in sm_set}
            cm_rel = {_relaxed_mpn(x) for x in cm_set}
            sm_rel.discard("")
            cm_rel.discard("")
            m_ok = bool(sm_rel & cm_rel)
        if not m_ok:
            attrs = cand.get("attributes") or {}
            flat = "".join(_norm_mpn(str(v)) for v in attrs.values())
            m_ok = any(sm in flat for sm in subject_mpns)
        if m_ok:
            if subject_brands:
                title = (cand.get("title") or "").lower()
                blob = " ".join(str(v).lower() for v in (cand.get("attributes") or {}).values())
                blob = f"{blob} {title}"
                if any(b in blob for b in subject_brands if len(b) >= 3):
                    return True, "mpn_and_brand_match"
                return False, "mpn_match_brand_mismatch"
            return True, "mpn_match"

    if subject_gtins and not c_gt:
        return False, "no_gtin_on_candidate"
    if subject_mpns and not c_mpns:
        return False, "no_mpn_on_candidate"
    return False, "identifier_mismatch"


def _snippet_from_pdp(pdp: dict, max_chars: int = 1200) -> str:
    """Plain product text for audit JSON (no scrape provenance — that stays in audit only)."""
    lines: list[str] = []
    t = (pdp.get("title") or "").strip()
    if t:
        lines.append(f"Title: {t}")
    pr = (pdp.get("price") or "").strip()
    if pr:
        lines.append(f"Price: {pr}")
    attrs = pdp.get("attributes") or {}
    if attrs:
        lines.append("Key attributes:")
        for k, v in list(attrs.items())[:25]:
            lines.append(f"  {k}: {v}")
    desc = (pdp.get("description") or "").strip()
    if desc:
        lines.append(f"Description: {desc[:500]}")
    text = "\n".join(lines)
    return text[:max_chars]


def _verified_excerpt_for_prompt(row: dict[str, Any]) -> str:
    """
    Text shown in the rendered prompt for a verified competitor.
    Prefer structured snippet; fall back to title/price so the block is never bare.
    """
    s = (row.get("snippet") or "").strip()
    if s:
        return s
    t = (row.get("title") or "").strip()
    p = (row.get("price") or "").strip()
    bits: list[str] = []
    if t:
        bits.append(f"Title: {t}")
    if p:
        bits.append(f"Price: {p}")
    if bits:
        return "\n".join(bits)
    return "(No extractable product text from this page.)"


def build_verified_context_block(
    verified: list[dict[str, Any]],
    subject_identity: dict[str, Any],
    had_identifiers: bool,
) -> str:
    if verified:
        parts = [
            "=== VERIFIED COMPETITOR PDPs (identifier-matched) ===",
            "Use ONLY the URLs below for exact same-product comparisons. "
            "Do not substitute other retailers or URLs.",
            "",
        ]
        for i, row in enumerate(verified, 1):
            parts.append(f"--- Competitor {i} ---")
            parts.append(f"URL: {row['url']}")
            parts.append(f"Verification: {row['reason']}")
            excerpt = _verified_excerpt_for_prompt(row)
            parts.append("Page excerpt (from competitor PDP scrape):")
            parts.append(excerpt)
            parts.append("")
        parts.append("=== END VERIFIED COMPETITORS ===")
        return "\n".join(parts)

    parts = [
        "=== VERIFIED COMPETITOR PDPs (identifier-matched) ===",
        "NO VERIFIED EXACT-MATCH competitor PDPs were found for this run.",
    ]
    if not had_identifiers:
        parts.append(
            "The subject PDP did not yield reliable product identifiers "
            "(GTIN/UPC/EAN or MPN) for automated matching."
        )
    parts.extend(
        [
            "Do NOT invent competitor URLs or claim exact matches you did not verify here.",
            "Focus on identifier-grounded improvements to the subject PDP only. "
            "You may discuss category-level gaps without naming unverified competitors.",
            "",
            "Subject identifiers extracted for matching:",
            f"  GTINs/UPCs: {', '.join(subject_identity.get('gtins') or []) or '(none)'}",
            f"  MPNs (normalized): {', '.join(subject_identity.get('mpns') or []) or '(none)'}",
            f"  Brands: {', '.join(subject_identity.get('brands') or []) or '(none)'}",
            "=== END VERIFIED COMPETITORS ===",
        ]
    )
    return "\n".join(parts)


def match_rate_for_reason(reason: str) -> float:
    """Heuristic confidence score shown in competitor-selection UI."""
    mapping = {
        "gtin_match": 1.0,
        "mpn_and_brand_match": 0.95,
        "mpn_match": 0.8,
    }
    return mapping.get((reason or "").strip(), 0.0)


def select_verified_competitors(
    verified_rows: list[dict[str, Any]],
    selected_urls: list[str] | None,
) -> list[dict[str, Any]]:
    """
    Keep only user-selected verified competitors.
    If selected_urls is falsy, keep all verified rows.
    """
    if not selected_urls:
        return list(verified_rows)
    allowed = {u.strip() for u in selected_urls if (u or "").strip()}
    if not allowed:
        return []
    return [row for row in verified_rows if (row.get("url") or "").strip() in allowed]


async def run_competitor_verification(
    pdp_data: dict,
    input_url: str,
) -> tuple[str, dict[str, Any]]:
    """
    Returns (prompt_context_block, audit_dict).
    On missing API keys, returns a neutral skip message and a small audit record.
    """
    ensure_backend_env_loaded()
    serp_key = (os.environ.get("SERPAPI_API_KEY") or "").strip()

    identity = extract_subject_identity(pdp_data)
    subject_gtins = set(identity.get("gtins") or [])
    subject_mpns = list(identity.get("mpns") or [])
    subject_brands = list(identity.get("brands") or [])
    had_ids = bool(subject_gtins or subject_mpns)

    audit: dict[str, Any] = {
        "skipped": False,
        "skip_reason": None,
        "subject_identifiers": {
            "gtins": sorted(subject_gtins),
            "mpns": subject_mpns,
            "brands": subject_brands,
        },
        "queries_run": [],
        "candidates": [],
        "verified": [],
    }

    if not serp_key:
        audit["skipped"] = True
        audit["skip_reason"] = "SERPAPI_API_KEY not set"
        block = (
            "=== VERIFIED COMPETITOR PDPs (identifier-matched) ===\n"
            "Competitor verification was skipped: SERPAPI_API_KEY is not configured.\n"
            "=== END VERIFIED COMPETITORS ==="
        )
        return block, audit

    subject_host = _host_key(input_url)
    queries = _build_queries(pdp_data, identity)
    if not queries:
        queries = [" ".join((pdp_data.get("title") or "product").split()[:8])]

    queries_run: list[dict[str, Any]] = []
    for q in queries:
        try:
            urls = await _serp_organic_links(q, serp_key)
        except Exception as exc:
            logger.warning("serpapi query failed q=%s err=%s", q, exc)
            queries_run.append({"query": q, "urls": [], "error": str(exc)})
            continue
        queries_run.append({"query": q, "urls": urls, "error": None})
    audit["queries_run"] = queries_run

    candidates = _merge_candidate_urls(queries_run, subject_host)
    audit["candidate_urls_ordered"] = list(candidates)

    if not candidates:
        audit["candidates"] = []
        audit["verified"] = []
        block = build_verified_context_block([], identity, had_ids)
        return block, audit

    sem = asyncio.Semaphore(SCRAPE_CONCURRENCY)

    async def _one(u: str) -> dict[str, Any]:
        async with sem:
            try:
                data = await asyncio.wait_for(
                    scrape_url_with_firecrawl(u), timeout=SCRAPE_TIMEOUT
                )
            except asyncio.TimeoutError:
                return {
                    "url": u,
                    "scraped": None,
                    "scrape_source": None,
                    "pass": False,
                    "reason": "scrape_timeout",
                    "error": "timeout",
                }
            except Exception as exc:
                return {
                    "url": u,
                    "scraped": None,
                    "scrape_source": None,
                    "pass": False,
                    "reason": "scrape_error",
                    "error": str(exc),
                }
            err = data.get("error")
            src = data.get("scrape_source")
            if err:
                return {
                    "url": u,
                    "scraped": {
                        "title": data.get("title"),
                        "error": err,
                        "scrape_source": src,
                    },
                    "scrape_source": src,
                    "pass": False,
                    "reason": "scrape_failed",
                    "error": err,
                }
            ok, reason = _verify_candidate(
                subject_gtins, subject_mpns, subject_brands, data
            )
            scraped_ident = extract_subject_identity(data)
            return {
                "url": u,
                "scraped": {
                    "title": data.get("title"),
                    "price": data.get("price"),
                    "identifiers": scraped_ident,
                    "snippet": _snippet_from_pdp(data),
                    "scrape_source": src,
                },
                "scrape_source": src,
                "pass": ok,
                "reason": reason,
                "error": None,
            }

    results = await asyncio.gather(*[_one(u) for u in candidates])
    audit["candidates"] = results

    verified_rows: list[dict[str, Any]] = []
    for row in results:
        if not row.get("pass"):
            continue
        scraped = row.get("scraped") or {}
        verified_rows.append(
            {
                "url": row["url"],
                "reason": row["reason"],
                "snippet": scraped.get("snippet") or "",
                "title": scraped.get("title"),
                "price": scraped.get("price"),
                "scrape_source": row.get("scrape_source")
                or scraped.get("scrape_source"),
            }
        )
        if len(verified_rows) >= MAX_VERIFIED:
            break

    audit["verified"] = verified_rows
    block = build_verified_context_block(verified_rows, identity, had_ids)
    return block, audit
