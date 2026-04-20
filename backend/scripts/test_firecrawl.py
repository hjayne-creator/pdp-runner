#!/usr/bin/env python3
"""One-off Firecrawl smoke test (same stack as competitor verification). Run from repo:

  cd backend && source .venv/bin/activate && python scripts/test_firecrawl.py

Uses ``backend/.env`` via ``ensure_backend_env_loaded()`` — set ``FIRECRAWL_API_KEY`` there.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


async def _run(url: str) -> None:
    from config import ensure_backend_env_loaded
    import os

    ensure_backend_env_loaded()
    has_key = bool((os.environ.get("FIRECRAWL_API_KEY") or "").strip())
    print("FIRECRAWL_API_KEY set:", has_key, flush=True)

    try:
        import firecrawl  # noqa: F401
    except ImportError:
        print("firecrawl-py: NOT installed (pip install -r requirements.txt)", flush=True)
    else:
        print("firecrawl-py: import ok", flush=True)

    from services.scraping.policy import scrape_url_with_firecrawl

    print("Scraping:", url, flush=True)
    data = await scrape_url_with_firecrawl(url)

    summary = {
        "scrape_source": data.get("scrape_source"),
        "error": data.get("error"),
        "title": (data.get("title") or "")[:120] or None,
        "price": data.get("price"),
        "raw_text_len": len((data.get("raw_text") or "") or ""),
    }
    print(json.dumps(summary, indent=2), flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description="Smoke-test Firecrawl scrape path")
    p.add_argument(
        "url",
        nargs="?",
        default="https://www.officedepot.com/a/products/584043/Sharpie-Paint-Markers-Extra-Fine-Point/#Description",
        help="PDP URL to scrape",
    )
    args = p.parse_args()
    asyncio.run(_run(args.url))


if __name__ == "__main__":
    main()
