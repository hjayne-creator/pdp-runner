from typing import Dict

from sqlalchemy.orm import Session

import models

DEFAULT_REPORT_TEMPLATE = "pdp-audit-v1"

REPORT_TEMPLATES: Dict[str, str] = {
    "pdp-audit-v1": """
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
""".strip(),
    "pdp-quick-brief-v1": """
=== OUTPUT CONTRACT ===
Return ONLY valid JSON (no markdown fences, no extra prose) with this exact shape:
{
  "analysis_metadata": {
    "analysis_date": "YYYY-MM-DD",
    "product_url": "https://...",
    "product_name": "string",
    "category": "string",
    "sku": "string",
    "model": "string"
  },

  "executive_summary": "2-4 sentences focused on what matters most",

  "risk_level": "Low|Medium|High",

  "benchmark_summary": {
    "overall_score": 0,
    "relative_position": "Leader|Competitive|Lagging",
    "score_breakdown": {
      "content_depth": 0,
      "feature_coverage": 0,
      "benefits": 0,
      "use_cases": 0,
      "faq": 0,
      "originality": 0
    }
  },

  "competitors": [
    {
      "name": "string",
      "url": "https://...",
      "price": "string",
      "is_exact_match": true,
      "similarity_score": 0,
      "content_summary": {
        "word_count": 0,
        "has_features": true,
        "has_benefits": true,
        "has_use_cases": true,
        "has_faq": true
      },
      "strengths": ["string"],
      "weaknesses": ["string"]
    }
  ],

  "content_gap_analysis": {
    "content_depth": {
      "score": 0,
      "gap_summary": "string",
      "missing_elements": ["string"]
    },
    "feature_coverage": {
      "score": 0,
      "missing_attributes": ["string"]
    },
    "benefits": {
      "score": 0,
      "missing_benefits": ["string"]
    },
    "use_cases": {
      "score": 0,
      "missing_use_cases": ["string"]
    },
    "faq": {
      "score": 0,
      "missing_questions": ["string"]
    },
    "originality": {
      "score": 0,
      "notes": "string"
    }
  },

  "recommended_content_additions": {
    "features": [
      {
        "feature": "string",
        "description": "string",
        "source": "competitor|inferred"
      }
    ],
    "benefits": [
      {
        "benefit": "string",
        "description": "string",
        "source": "competitor|inferred"
      }
    ],
    "use_cases": [
      {
        "use_case": "string",
        "description": "string"
      }
    ],
    "faq": [
      {
        "question": "string",
        "answer": "string"
      }
    ],
    "comparison_points": [
      {
        "point": "string",
        "details": "string"
      }
    ]
  },

  "generated_content": {
    "product_description": {
      "short_description": "string (1-2 sentences for above the fold)",
      "long_description": "string (full enriched product description)",
      "key_features": [
        "string"
      ],
      "benefits_section": [
        {
          "title": "string",
          "description": "string"
        }
      ],
      "use_cases_section": [
        "string"
      ],
      "faq_section": [
        {
          "question": "string",
          "answer": "string"
        }
      ],
      "comparison_section": [
        {
          "title": "string",
          "description": "string"
        }
      ]
    }
  },

  "top_issues": [
    {
      "issue": "string",
      "impact": "string",
      "recommended_action": "string",
      "priority": "High|Medium|Low"
    }
  ],

  "top_opportunities": [
    {
      "opportunity": "string",
      "why_it_matters": "string",
      "recommended_action": "string",
      "estimated_impact": "High|Medium|Low"
    }
  ],

  "quick_wins": [
    "string"
  ],

  "strategic_recommendations": [
    "string"
  ],

  "publish_readiness": "Ready|Needs review|Blocked",

  "confidence_score": 0,

  "sources": ["https://..."]
}
=== END OUTPUT CONTRACT ===
""".strip(),
}


def get_output_contract(template_id: str, db: Session | None = None) -> str:
    if db is not None:
        record = (
            db.query(models.ReportTemplate)
            .filter(models.ReportTemplate.key == template_id)
            .first()
        )
        if record and record.output_contract:
            selected = record.output_contract.strip()
            return f"{selected}\n"

    selected = REPORT_TEMPLATES.get(template_id, REPORT_TEMPLATES[DEFAULT_REPORT_TEMPLATE])
    return f"{selected}\n"
