"""URL helpers shared by scrapers."""
import re


def normalize_pdp_url(url: str) -> str:
    """Ensure scheme so httpx / Firecrawl / Playwright receive absolute URLs."""
    u = (url or "").strip()
    if not u:
        return u
    if not re.match(r"^https?://", u, re.I):
        u = f"https://{u}"
    return u
