"""PDP scraping: transports (local, Firecrawl) and orchestration policy."""

from services.scraping.policy import (
    fetch_pdp,
    fetch_pdp_without_firecrawl,
    firecrawl_fetch_looks_usable,
    scrape_url_with_firecrawl,
)

__all__ = [
    "fetch_pdp",
    "fetch_pdp_without_firecrawl",
    "firecrawl_fetch_looks_usable",
    "scrape_url_with_firecrawl",
]
