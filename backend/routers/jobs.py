import time
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models, schemas
from services.pdp_service import (
    fetch_pdp,
    pdp_is_actionable,
    render_prompt,
)
from services.competitor_verification import run_competitor_verification
from services.competitor_verification import (
    build_verified_context_block,
    match_rate_for_reason,
    select_verified_competitors,
)
from services.ai_service import run_ai_stream
from services.report_definitions import (
    build_definition_snapshot,
    build_contract_from_snapshot,
    build_blocked_payload,
    parse_output_with_warnings,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])
_log = logging.getLogger(__name__)


def _load_job(job_id: str, db: Session) -> models.Job:
    job = (
        db.query(models.Job)
        .options(
            joinedload(models.Job.customer),
            joinedload(models.Job.prompt),
            joinedload(models.Job.model),
            joinedload(models.Job.report_type),
            joinedload(models.Job.report_definition),
        )
        .filter(models.Job.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(404, detail="Job not found")
    return job


@router.get("/", response_model=List[schemas.JobOut])
def list_jobs(
    customer_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Job)
        .options(
            joinedload(models.Job.customer),
            joinedload(models.Job.prompt),
            joinedload(models.Job.model),
            joinedload(models.Job.report_type),
            joinedload(models.Job.report_definition),
        )
        .order_by(models.Job.created_at.desc())
    )
    if customer_id:
        q = q.filter(models.Job.customer_id == customer_id)
    return q.offset(offset).limit(limit).all()


@router.get("/{job_id}", response_model=schemas.JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    return _load_job(job_id, db)


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.post("/verify-competitors", response_model=schemas.CompetitorVerifyOut)
async def verify_competitors(body: schemas.CompetitorVerifyCreate, db: Session = Depends(get_db)):
    report_type_obj: Optional[models.ReportType] = None
    if body.report_type_id:
        report_type_obj = (
            db.query(models.ReportType)
            .options(
                joinedload(models.ReportType.report_definition).joinedload(
                    models.ReportDefinition.sections
                ).joinedload(models.ReportDefinitionSection.report_section),
            )
            .filter(models.ReportType.id == body.report_type_id)
            .first()
        )
        if not report_type_obj:
            raise HTTPException(404, detail="Report type not found")

    if body.verify_competitors is None:
        verification_enabled = bool(
            report_type_obj.requires_competitor_verification if report_type_obj else False
        )
    else:
        verification_enabled = bool(body.verify_competitors)

    if not verification_enabled:
        return schemas.CompetitorVerifyOut(
            verification_enabled=False,
            verification_run=False,
            skipped=True,
            skip_reason="verification_not_selected",
            summary_message="Competitor verification was not selected for this run.",
            total_candidates=0,
            total_verified=0,
            options=[],
            competitor_audit=None,
        )

    pdp_data = await fetch_pdp(body.input_url)
    if not pdp_is_actionable(pdp_data):
        reason = pdp_data.get("error") or "subject_pdp_not_actionable"
        return schemas.CompetitorVerifyOut(
            verification_enabled=True,
            verification_run=False,
            skipped=True,
            skip_reason="subject_pdp_not_actionable",
            summary_message=(
                "Competitor verification skipped because the subject PDP could not be loaded reliably."
            ),
            total_candidates=0,
            total_verified=0,
            options=[],
            competitor_audit={
                "skipped": True,
                "skip_reason": "subject_pdp_not_actionable",
                "error": reason,
                "queries_run": [],
                "candidates": [],
                "verified": [],
            },
        )

    _, competitor_audit = await run_competitor_verification(pdp_data, body.input_url)
    verified = (competitor_audit or {}).get("verified") or []
    candidates = (competitor_audit or {}).get("candidates") or []
    options: list[schemas.VerifiedCompetitorOption] = []
    for row in verified:
        options.append(
            schemas.VerifiedCompetitorOption(
                url=row.get("url") or "",
                title=row.get("title"),
                price=row.get("price"),
                reason=row.get("reason") or "identifier_match",
                match_rate=match_rate_for_reason(row.get("reason") or ""),
                snippet=(row.get("snippet") or "")[:500],
                scrape_source=row.get("scrape_source"),
            )
        )

    skipped = bool((competitor_audit or {}).get("skipped"))
    skip_reason = (competitor_audit or {}).get("skip_reason")
    if options:
        summary_message = (
            f"Verified {len(options)} of {len(candidates)} candidate competitor PDP(s). "
            "Select one or more to include in this run."
        )
    elif skipped:
        summary_message = f"Competitor verification skipped: {skip_reason or 'unknown'}."
    else:
        summary_message = "No verified exact-match competitor PDPs were found."

    return schemas.CompetitorVerifyOut(
        verification_enabled=True,
        verification_run=True,
        skipped=skipped,
        skip_reason=skip_reason,
        summary_message=summary_message,
        total_candidates=len(candidates),
        total_verified=len(options),
        options=options,
        competitor_audit=competitor_audit,
    )


@router.post("/run")
async def run_job(body: schemas.JobCreate, db: Session = Depends(get_db)):
    """
    Create a job, fetch the PDP, render the prompt, stream AI output.
    Returns SSE stream: data: <token>\n\n
    Final event: data: [DONE] <job_id>\n\n
    """
    customer = db.query(models.Customer).filter(models.Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(404, detail="Customer not found")

    prompt_obj = db.query(models.Prompt).filter(models.Prompt.id == body.prompt_id).first()
    if not prompt_obj:
        raise HTTPException(404, detail="Prompt not found")

    model_obj = db.query(models.AIModel).filter(models.AIModel.id == body.model_id).first()
    if not model_obj:
        raise HTTPException(404, detail="Model not found")

    report_type_obj: Optional[models.ReportType] = None
    if body.report_type_id:
        report_type_obj = (
            db.query(models.ReportType)
            .options(
                joinedload(models.ReportType.report_definition).joinedload(
                    models.ReportDefinition.sections
                ).joinedload(models.ReportDefinitionSection.report_section),
            )
            .filter(models.ReportType.id == body.report_type_id)
            .first()
        )
        if not report_type_obj:
            raise HTTPException(404, detail="Report type not found")
    else:
        # Fallback: pick the first active report type so legacy callers still work.
        report_type_obj = (
            db.query(models.ReportType)
            .options(
                joinedload(models.ReportType.report_definition).joinedload(
                    models.ReportDefinition.sections
                ).joinedload(models.ReportDefinitionSection.report_section),
            )
            .filter(models.ReportType.active == True)
            .order_by(models.ReportType.sort_order, models.ReportType.label)
            .first()
        )
        if not report_type_obj:
            raise HTTPException(
                400,
                detail="No active report types configured. Create one in Admin → Report Types.",
            )

    if not report_type_obj.report_definition:
        raise HTTPException(
            400,
            detail=(
                f"Report type '{report_type_obj.label}' has no Report Definition set. "
                "Pick one in Admin → Report Types."
            ),
        )

    # Capture scalars now — the SSE generator runs after the request session closes.
    prompt_content = prompt_obj.content
    model_display_name = model_obj.display_name
    model_provider = model_obj.provider
    model_model_id = model_obj.model_id
    model_max_tokens = model_obj.max_tokens
    model_config = dict(model_obj.config or {})
    definition_snapshot = build_definition_snapshot(report_type_obj.report_definition)
    output_contract = build_contract_from_snapshot(definition_snapshot)
    report_type_id = report_type_obj.id
    report_definition_id = report_type_obj.report_definition_id
    report_definition_version = (definition_snapshot or {}).get("version")
    if body.verify_competitors is None:
        verify_competitors = bool(report_type_obj.requires_competitor_verification)
    else:
        verify_competitors = bool(body.verify_competitors)

    job = models.Job(
        customer_id=body.customer_id,
        prompt_id=body.prompt_id,
        model_id=body.model_id,
        report_type_id=report_type_id,
        report_definition_id=report_definition_id,
        report_definition_version=report_definition_version,
        report_definition_snapshot=definition_snapshot,
        input_url=body.input_url,
        status="running",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    async def event_stream() -> AsyncGenerator[str, None]:
        start_ms = int(time.time() * 1000)
        output_chunks: list[str] = []
        error_msg: Optional[str] = None
        pdp_data: Optional[dict] = None
        rendered: Optional[str] = None
        competitor_audit: Optional[dict] = None
        verified_context: Optional[str] = None

        try:
            yield f"data: {json.dumps({'type': 'status', 'message': 'Fetching product page...'})}\n\n"
            pdp_data = await fetch_pdp(body.input_url)

            if pdp_data.get("error"):
                warn_msg = f"PDP fetch warning: {pdp_data['error']}"
                yield f"data: {json.dumps({'type': 'warning', 'message': warn_msg})}\n\n"

            if verify_competitors and pdp_is_actionable(pdp_data):
                yield f"data: {json.dumps({'type': 'status', 'message': 'Discovering competitor PDPs (SerpAPI)…'})}\n\n"
                try:
                    verified_context, competitor_audit = await run_competitor_verification(
                        pdp_data, body.input_url
                    )
                except Exception as cexc:
                    _log.warning("competitor verification failed: %s", cexc, exc_info=True)
                    competitor_audit = {
                        "skipped": True,
                        "skip_reason": "verification_error",
                        "error": str(cexc),
                        "queries_run": [],
                        "candidates": [],
                        "verified": [],
                    }
                    verified_context = (
                        "=== VERIFIED COMPETITOR PDPs (identifier-matched) ===\n"
                        "Competitor verification failed on the server; do not invent "
                        "competitor URLs. Proceed with identifier-grounded subject PDP "
                        "improvements only.\n"
                        "=== END VERIFIED COMPETITORS ==="
                    )
                n_ver = len((competitor_audit or {}).get("verified") or [])
                selected_urls = body.selected_competitor_urls or []
                if selected_urls and competitor_audit:
                    selected_verified = select_verified_competitors(
                        (competitor_audit.get("verified") or []),
                        selected_urls,
                    )
                    competitor_audit["verified"] = selected_verified
                    identity = (competitor_audit or {}).get("subject_identifiers") or {}
                    had_ids = bool((identity.get("gtins") or []) or (identity.get("mpns") or []))
                    verified_context = build_verified_context_block(
                        selected_verified, identity, had_ids
                    )
                    n_ver = len(selected_verified)
                    yield f"data: {json.dumps({'type': 'status', 'message': f'Using {n_ver} user-selected verified competitor PDP(s).'})}\n\n"
                if competitor_audit and competitor_audit.get("skipped"):
                    reason = competitor_audit.get("skip_reason") or "unknown"
                    skip_msg = f"Competitor verification skipped: {reason}"
                    err = competitor_audit.get("error")
                    if err:
                        skip_msg = f"{skip_msg} ({err})"
                    yield f"data: {json.dumps({'type': 'warning', 'message': skip_msg})}\n\n"
                elif n_ver == 0:
                    yield f"data: {json.dumps({'type': 'warning', 'message': 'No verified exact-match competitor PDPs; analysis will use identifier-grounded subject improvements only.'})}\n\n"
                else:
                    ok_msg = f"Verified {n_ver} competitor PDP(s) for the final prompt."
                    yield f"data: {json.dumps({'type': 'status', 'message': ok_msg})}\n\n"
            elif verify_competitors:
                competitor_audit = {
                    "skipped": True,
                    "skip_reason": "subject_pdp_not_actionable",
                    "subject_identifiers": {},
                    "queries_run": [],
                    "candidates": [],
                    "verified": [],
                }
                verified_context = (
                    "=== VERIFIED COMPETITOR PDPs (identifier-matched) ===\n"
                    "Competitor verification was skipped because the subject PDP "
                    "could not be loaded reliably.\n"
                    "=== END VERIFIED COMPETITORS ==="
                )
                yield f"data: {json.dumps({'type': 'warning', 'message': 'Competitor verification skipped: subject PDP was not actionable.'})}\n\n"

            yield f"data: {json.dumps({'type': 'status', 'message': 'Rendering prompt...'})}\n\n"
            rendered = render_prompt(
                prompt_content,
                pdp_data,
                body.input_url,
                output_contract,
                verified_competitor_context=verified_context,
            )

            if not pdp_is_actionable(pdp_data):
                reason = (
                    pdp_data.get("error")
                    or "The product URL did not return usable page content after automatic retries."
                )
                yield f"data: {json.dumps({'type': 'status', 'message': 'Skipping model: no usable PDP content (blocked or empty).'})}\n\n"
                blocked = json.dumps(
                    build_blocked_payload(definition_snapshot, reason),
                    indent=2,
                )
                output_chunks.append(blocked)
                yield f"data: {json.dumps({'type': 'token', 'content': blocked})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'status', 'message': f'Running {model_display_name}...'})}\n\n"
                async for chunk in run_ai_stream(
                    provider=model_provider,
                    model_id=model_model_id,
                    prompt=rendered,
                    max_tokens=model_max_tokens,
                    config=model_config,
                ):
                    output_chunks.append(chunk)
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"

        except Exception as exc:
            error_msg = str(exc)
            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"

        finally:
            duration_ms = int(time.time() * 1000) - start_ms
            full_output = "".join(output_chunks)
            parse_warnings = parse_output_with_warnings(full_output, definition_snapshot)

            from database import SessionLocal
            write_db = SessionLocal()
            try:
                final_job = write_db.query(models.Job).filter(models.Job.id == job_id).first()
                if final_job:
                    final_job.output = full_output
                    final_job.pdp_data = pdp_data
                    if verify_competitors:
                        final_job.competitor_verification = competitor_audit
                    final_job.report_definition_id = report_definition_id
                    final_job.report_definition_version = report_definition_version
                    final_job.report_definition_snapshot = definition_snapshot
                    final_job.report_parse_warnings = parse_warnings
                    final_job.prompt_rendered = rendered
                    final_job.status = "failed" if error_msg else "completed"
                    final_job.error = error_msg
                    final_job.duration_ms = duration_ms
                    final_job.completed_at = datetime.now(timezone.utc)
                    write_db.commit()
            finally:
                write_db.close()

            yield f"data: {json.dumps({'type': 'done', 'job_id': job_id, 'duration_ms': duration_ms})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
