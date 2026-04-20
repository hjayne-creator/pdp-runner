"""Local PDP fetch: httpx then Playwright."""
from __future__ import annotations

import logging

import httpx

from services.scraping.pdp_parse import (
    has_useful_pdp_content,
    is_bot_challenge_page,
    parse_html,
)

logger = logging.getLogger(__name__)

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
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


async def fetch_with_playwright(url: str) -> dict:
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
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)
            html = await page.content()
            await browser.close()

        return parse_html(url, html)
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


async def fetch_pdp_local(url: str) -> dict:
    """httpx + BeautifulSoup, then Playwright when blocked or empty."""
    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=30.0,
        ) as client:
            resp = await client.get(url)

        if resp.status_code in (403, 429, 503) or resp.status_code >= 500:
            return await fetch_with_playwright(url)

        resp.raise_for_status()
        html = resp.text

        data = parse_html(url, html)

        if not has_useful_pdp_content(data) or is_bot_challenge_page(data):
            data = await fetch_with_playwright(url)

        return data

    except Exception as exc:
        pw = await fetch_with_playwright(url)
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
