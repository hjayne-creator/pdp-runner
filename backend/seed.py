"""Seed the database with initial data.

Single-tenant retail workflow with three report types — each one wires together
a default prompt, an output format (renderer + contract), and behavior flags.

The **retail bootstrap** (output formats + default prompts + report types) runs
only once per database. After that, Admin is authoritative: restarts do not
re-insert deleted rows. To re-run defaults from code, delete the SQLite file or
run: ``python seed.py --force-bootstrap``

AI models are still seeded only when the ``ai_models`` table is empty.
"""
from database import SessionLocal, engine
import models
from services.report_templates import OUTPUT_CONTRACTS

# Marks that built-in retail defaults were applied; checked before any bootstrap I/O.
RETAIL_BOOTSTRAP_SETTING_KEY = "retail_bootstrap_v1"

# Built-in OutputFormats. ``key`` doubles as the frontend renderer lookup.
OUTPUT_FORMAT_SPECS = [
    {
        "key": "pdp-ai-rewrite-v1",
        "label": "PDP AI Rewrite",
        "description": "Placeholder — edit in Admin.",
        "contract_key": "pdp-ai-rewrite-v1",
        "sort_order": 10,
    },
    {
        "key": "pdp-gap-analysis-v1",
        "label": "PDP GAP Analysis",
        "description": "Placeholder — edit in Admin.",
        "contract_key": "pdp-gap-analysis-v1",
        "sort_order": 20,
    },
    {
        "key": "pdp-gap-analysis-rewrite-v1",
        "label": "PDP Gap Analysis + Rewrite",
        "description": "Placeholder — edit in Admin.",
        "contract_key": "pdp-gap-analysis-rewrite-v1",
        "sort_order": 30,
    },
]

# ── Placeholder retail prompts (admins can edit / replace in Admin) ─────────

RETAIL_REWRITE_PLACEHOLDER = """You are a retail eCommerce PDP assistant.

PRIMARY GOAL
Improve the Subject's PDP description for completeness and SEO. 

AUDIENCE
Write for shoppers / customers.

AVOID:
- generic AI copy
- exaggerated persuasion
- empty SEO prose
- Phrases like:
- "perfect for a wide range of applications"
- "game-changing"
- "aesthetically pleasing"
- "you need this"
- "plethora of projects"
- unsupported claims of superiority, loyalty, or conversion impact

Product URL: {{URL}}

{{PDP_DATA}}

Follow the output structure:
{{OUTPUT_CONTRACT}}
"""

RETAIL_COMPETITORS_PLACEHOLDER = """You are a retail eCommerce competitive analyst.

Task: Competitor-focused analysis. When verified competitor PDP excerpts appear below, use them for benchmarking. If none appear, analyze gaps and risks using only the subject PDP and state that competitor pages were not available.

Product URL: {{URL}}

{{PDP_DATA}}

{{VERIFIED_COMPETITOR_CONTEXT}}

Follow the output structure exactly:
{{OUTPUT_CONTRACT}}
"""

RETAIL_COMPETITORS_REWRITE_PLACEHOLDER = """You are a retail eCommerce strategist and copywriter.

Task: Combine competitor-grounded analysis with a revised PDP narrative and modules. Do not invent facts; ground recommendations in the subject PDP and any verified competitor context.

Product URL: {{URL}}

{{PDP_DATA}}

{{VERIFIED_COMPETITOR_CONTEXT}}

Follow the output structure exactly:
{{OUTPUT_CONTRACT}}
"""


# Each spec is a self-contained (prompt, report-type) pair the seed will create
# together so the FK can be wired in one pass.
RETAIL_SEED_SPECS = [
    {
        "prompt_name": "Retail — AI rewrite",
        "prompt_description": "Default prompt for the 'PDP AI rewrite' report type.",
        "prompt_content": RETAIL_REWRITE_PLACEHOLDER,
        "report_key": "retail-rewrite",
        "report_label": "PDP AI rewrite",
        "report_description": "Placeholder — edit in Admin.",
        "report_icon": "Wand2",
        "output_format_key": "pdp-ai-rewrite-v1",
        "requires_verification": False,
        "sort_order": 10,
    },
    {
        "prompt_name": "Retail — Competitor analysis",
        "prompt_description": "Default prompt for the 'Competitor analysis' report type.",
        "prompt_content": RETAIL_COMPETITORS_PLACEHOLDER,
        "report_key": "retail-competitors",
        "report_label": "Competitor analysis",
        "report_description": "Placeholder — edit in Admin.",
        "report_icon": "Users",
        "output_format_key": "pdp-gap-analysis-v1",
        "requires_verification": True,
        "sort_order": 20,
    },
    {
        "prompt_name": "Retail — Competitor analysis + rewrite",
        "prompt_description": "Default prompt for the 'Competitor analysis + rewrite' report type.",
        "prompt_content": RETAIL_COMPETITORS_REWRITE_PLACEHOLDER,
        "report_key": "retail-competitors-rewrite",
        "report_label": "Competitor analysis + rewrite",
        "report_description": "Placeholder — edit in Admin.",
        "report_icon": "Layers",
        "output_format_key": "pdp-gap-analysis-rewrite-v1",
        "requires_verification": True,
        "sort_order": 30,
    },
]


def _retail_bootstrap_done(db) -> bool:
    return (
        db.query(models.AppSetting)
        .filter(models.AppSetting.key == RETAIL_BOOTSTRAP_SETTING_KEY)
        .first()
        is not None
    )


def _mark_retail_bootstrap_done(db) -> None:
    if (
        db.query(models.AppSetting)
        .filter(models.AppSetting.key == RETAIL_BOOTSTRAP_SETTING_KEY)
        .first()
    ):
        return
    db.add(models.AppSetting(key=RETAIL_BOOTSTRAP_SETTING_KEY, value="1"))
    db.commit()


def _clear_retail_bootstrap_flag(db) -> None:
    db.query(models.AppSetting).filter(
        models.AppSetting.key == RETAIL_BOOTSTRAP_SETTING_KEY
    ).delete()
    db.commit()


def _ensure_output_formats(db) -> dict[str, models.OutputFormat]:
    """Ensure built-in OutputFormats exist (bootstrap only). Returns a key→row map.

    For pre-existing rows, only fills empty contract / missing label from
    migration placeholders — runs once per DB before the bootstrap flag is set.
    """
    by_key: dict[str, models.OutputFormat] = {}
    for spec in OUTPUT_FORMAT_SPECS:
        contract = OUTPUT_CONTRACTS[spec["contract_key"]]
        fmt = (
            db.query(models.OutputFormat)
            .filter(models.OutputFormat.key == spec["key"])
            .first()
        )
        if not fmt:
            fmt = models.OutputFormat(
                key=spec["key"],
                label=spec["label"],
                description=spec["description"],
                contract=contract,
                active=True,
                sort_order=spec["sort_order"],
            )
            db.add(fmt)
            db.commit()
            db.refresh(fmt)
        else:
            # Heal placeholder rows written by the migration: empty contract,
            # or label that's just the raw key (no human-friendly text yet).
            changed = False
            if not fmt.contract or fmt.contract.strip() == "":
                fmt.contract = contract
                changed = True
            if not fmt.label or fmt.label == fmt.key:
                fmt.label = spec["label"]
                changed = True
            if not fmt.description:
                fmt.description = spec["description"]
                changed = True
            if changed:
                db.commit()
        by_key[spec["key"]] = fmt
    return by_key


def _ensure_tenant(db) -> models.Customer:
    cust = db.query(models.Customer).order_by(models.Customer.created_at.asc()).first()
    if cust:
        return cust
    cust = models.Customer(
        name="Default",
        slug="default",
        description="Single-tenant default organization. Prompts and jobs are scoped here.",
    )
    db.add(cust)
    db.commit()
    db.refresh(cust)
    print("✓ Seeded default tenant")
    return cust


def _ensure_retail_seed(db) -> None:
    """Idempotently ensure retail prompts + report types exist and are linked."""
    cust = _ensure_tenant(db)
    formats = _ensure_output_formats(db)

    for spec in RETAIL_SEED_SPECS:
        fmt = formats[spec["output_format_key"]]
        report = (
            db.query(models.ReportType)
            .filter(models.ReportType.key == spec["report_key"])
            .first()
        )
        prompt = (
            db.query(models.Prompt)
            .filter(
                models.Prompt.customer_id == cust.id,
                models.Prompt.name == spec["prompt_name"],
            )
            .first()
        )

        if not prompt:
            prompt = models.Prompt(
                customer_id=cust.id,
                name=spec["prompt_name"],
                description=spec["prompt_description"],
                content=spec["prompt_content"],
                version=1,
            )
            db.add(prompt)
            db.commit()
            db.refresh(prompt)

        if not report:
            report = models.ReportType(
                key=spec["report_key"],
                label=spec["report_label"],
                description=spec["report_description"],
                workflow="retail",
                icon=spec["report_icon"],
                default_prompt_id=prompt.id,
                output_format_id=fmt.id,
                requires_competitor_verification=spec["requires_verification"],
                active=True,
                sort_order=spec["sort_order"],
            )
            db.add(report)
            db.commit()
        else:
            changed = False
            # Heal stale prompt FK.
            stale_prompt = report.default_prompt_id is None or not (
                db.query(models.Prompt)
                .filter(models.Prompt.id == report.default_prompt_id)
                .first()
            )
            if stale_prompt:
                report.default_prompt_id = prompt.id
                changed = True
            # Heal stale or missing format FK.
            stale_format = report.output_format_id is None or not (
                db.query(models.OutputFormat)
                .filter(models.OutputFormat.id == report.output_format_id)
                .first()
            )
            if stale_format:
                report.output_format_id = fmt.id
                changed = True
            if changed:
                db.commit()


def seed(force_bootstrap: bool = False):
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if force_bootstrap:
            _clear_retail_bootstrap_flag(db)

        if not db.query(models.AIModel).first():
            ai_models = [
                models.AIModel(
                    name="gpt-5-2",
                    display_name="GPT (5.2)",
                    provider="openai",
                    model_id="gpt-4o",
                    description="OpenAI GPT-4o — fast, capable, large context",
                    max_tokens=8192,
                    supports_streaming=True,
                    config={},
                ),
                models.AIModel(
                    name="claude-4-6",
                    display_name="Claude (4.6)",
                    provider="anthropic",
                    model_id="claude-opus-4-5",
                    description="Anthropic Claude Opus — excellent for long-form analysis",
                    max_tokens=8192,
                    supports_streaming=True,
                    config={},
                ),
            ]
            for m in ai_models:
                db.add(m)
            db.commit()
            print("✓ Seeded AI models")

        if _retail_bootstrap_done(db) and not force_bootstrap:
            print("✓ Retail bootstrap skipped (Admin data kept across restarts)")
            return

        _ensure_retail_seed(db)
        _mark_retail_bootstrap_done(db)
        print("✓ Initial retail bootstrap completed (report types, formats, prompts)")

    finally:
        db.close()


if __name__ == "__main__":
    import sys

    if "--clear-bootstrap-flag" in sys.argv:
        db = SessionLocal()
        try:
            _clear_retail_bootstrap_flag(db)
            print(
                "Cleared retail bootstrap flag. Next app start will run bootstrap "
                "for missing keys only (won't delete Admin changes)."
            )
        finally:
            db.close()
    else:
        seed(force_bootstrap="--force-bootstrap" in sys.argv)
