import time
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models, schemas
from services.pdp_service import fetch_pdp, render_prompt
from services.ai_service import run_ai_stream

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _load_job(job_id: str, db: Session) -> models.Job:
    job = (
        db.query(models.Job)
        .options(
            joinedload(models.Job.customer),
            joinedload(models.Job.prompt),
            joinedload(models.Job.model),
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


@router.post("/run")
async def run_job(body: schemas.JobCreate, db: Session = Depends(get_db)):
    """
    Create a job, fetch the PDP, render the prompt, stream AI output.
    Returns SSE stream: data: <token>\n\n
    Final event: data: [DONE] <job_id>\n\n
    """
    # Validate references
    customer = db.query(models.Customer).filter(models.Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(404, detail="Customer not found")

    prompt_obj = db.query(models.Prompt).filter(models.Prompt.id == body.prompt_id).first()
    if not prompt_obj:
        raise HTTPException(404, detail="Prompt not found")

    model_obj = db.query(models.AIModel).filter(models.AIModel.id == body.model_id).first()
    if not model_obj:
        raise HTTPException(404, detail="Model not found")

    # Extract all needed values as plain scalars NOW, while the session is alive.
    # The event_stream generator runs after FastAPI closes the request-scoped
    # session, so ORM instances become detached and attribute access fails.
    prompt_content = prompt_obj.content
    model_display_name = model_obj.display_name
    model_provider = model_obj.provider
    model_model_id = model_obj.model_id
    model_max_tokens = model_obj.max_tokens
    model_config = dict(model_obj.config or {})

    # Create job record
    job = models.Job(
        customer_id=body.customer_id,
        prompt_id=body.prompt_id,
        model_id=body.model_id,
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

        try:
            # 1. Fetch PDP
            yield f"data: {json.dumps({'type': 'status', 'message': 'Fetching product page...'})}\n\n"
            pdp_data = await fetch_pdp(body.input_url)

            if pdp_data.get("error"):
                warn_msg = f"PDP fetch warning: {pdp_data['error']}"
                yield f"data: {json.dumps({'type': 'warning', 'message': warn_msg})}\n\n"

            # 2. Render prompt
            yield f"data: {json.dumps({'type': 'status', 'message': 'Rendering prompt...'})}\n\n"
            rendered = render_prompt(prompt_content, pdp_data, body.input_url)

            # 3. Stream AI
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
            # Persist result
            duration_ms = int(time.time() * 1000) - start_ms
            full_output = "".join(output_chunks)

            # Use a fresh DB session for the final write
            from database import SessionLocal
            write_db = SessionLocal()
            try:
                final_job = write_db.query(models.Job).filter(models.Job.id == job_id).first()
                if final_job:
                    final_job.output = full_output
                    final_job.pdp_data = pdp_data if 'pdp_data' in dir() else None
                    final_job.prompt_rendered = rendered if 'rendered' in dir() else None
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
