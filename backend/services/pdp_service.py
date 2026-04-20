"""
PDP-facing API: scraping delegates to ``services.scraping``; prompt rendering stays here.
"""
import json
from typing import Optional

from config import ensure_backend_env_loaded
from services.scraping.pdp_parse import pdp_is_actionable
from services.scraping.policy import (
    fetch_pdp,
    fetch_pdp_without_firecrawl,
    scrape_url_with_firecrawl,
)


def blocked_analysis_json(reason: str, output_renderer: str = "pdp-audit-v1") -> str:
    """Valid JSON matching the report renderer's contract when the PDP cannot be loaded."""
    if output_renderer == "pdp-quick-brief-v1":
        quick_payload = {
            "executive_summary": "Unable to generate a complete brief because the PDP could not be loaded.",
            "risk_level": "High",
            "top_issues": [
                {
                    "issue": "PDP source unavailable",
                    "impact": reason,
                    "recommended_action": "Retry with a reachable product URL or provide alternate source documents.",
                }
            ],
            "top_opportunities": [],
            "publish_readiness": "Blocked",
            "sources": [],
        }
        return json.dumps(quick_payload, indent=2)

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


def render_prompt(
    prompt_template: str,
    pdp_data: dict,
    url: str,
    output_contract: str,
    verified_competitor_context: Optional[str] = None,
) -> str:
    """Replace template variables in a prompt with PDP data + the chosen output contract."""
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

    rendered = prompt_template
    vcc = (verified_competitor_context or "").strip()
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
        "{{VERIFIED_COMPETITOR_CONTEXT}}": vcc,
    }
    for placeholder, value in placeholders.items():
        rendered = rendered.replace(placeholder, value)

    if context not in rendered:
        rendered = rendered + f"\n\n{context}"

    if "{{VERIFIED_COMPETITOR_CONTEXT}}" not in prompt_template and vcc:
        rendered += f"\n\n{vcc}"

    contract = (output_contract or "").strip()
    if contract:
        if "{{OUTPUT_CONTRACT}}" in rendered:
            rendered = rendered.replace("{{OUTPUT_CONTRACT}}", contract)
        else:
            rendered += f"\n\n{contract}\n"

    return rendered


__all__ = [
    "ensure_backend_env_loaded",
    "fetch_pdp",
    "fetch_pdp_without_firecrawl",
    "scrape_url_with_firecrawl",
    "pdp_is_actionable",
    "blocked_analysis_json",
    "render_prompt",
]
