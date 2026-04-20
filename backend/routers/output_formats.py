from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas

router = APIRouter(prefix="/output-formats", tags=["output-formats"])


@router.get("/", response_model=List[schemas.OutputFormatOut])
def list_output_formats(
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(models.OutputFormat)
    if active_only:
        q = q.filter(models.OutputFormat.active == True)
    return q.order_by(models.OutputFormat.sort_order, models.OutputFormat.label).all()


@router.get("/{format_id}", response_model=schemas.OutputFormatOut)
def get_output_format(format_id: str, db: Session = Depends(get_db)):
    fmt = db.query(models.OutputFormat).filter(models.OutputFormat.id == format_id).first()
    if not fmt:
        raise HTTPException(404, detail="Output format not found")
    return fmt


@router.post("/", response_model=schemas.OutputFormatOut)
def create_output_format(body: schemas.OutputFormatCreate, db: Session = Depends(get_db)):
    if db.query(models.OutputFormat).filter(models.OutputFormat.key == body.key).first():
        raise HTTPException(400, detail=f"Output format key '{body.key}' already exists")
    fmt = models.OutputFormat(**body.model_dump())
    db.add(fmt)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.patch("/{format_id}", response_model=schemas.OutputFormatOut)
def update_output_format(
    format_id: str, body: schemas.OutputFormatUpdate, db: Session = Depends(get_db)
):
    fmt = db.query(models.OutputFormat).filter(models.OutputFormat.id == format_id).first()
    if not fmt:
        raise HTTPException(404, detail="Output format not found")

    updates = body.model_dump(exclude_unset=True)
    if "key" in updates and updates["key"] != fmt.key:
        conflict = (
            db.query(models.OutputFormat)
            .filter(models.OutputFormat.key == updates["key"])
            .first()
        )
        if conflict:
            raise HTTPException(400, detail=f"Output format key '{updates['key']}' already exists")

    for k, v in updates.items():
        setattr(fmt, k, v)

    db.commit()
    db.refresh(fmt)
    return fmt


@router.delete("/{format_id}")
def delete_output_format(format_id: str, db: Session = Depends(get_db)):
    fmt = db.query(models.OutputFormat).filter(models.OutputFormat.id == format_id).first()
    if not fmt:
        raise HTTPException(404, detail="Output format not found")
    # Linked report types will have their output_format_id set to NULL via the
    # ondelete=SET NULL FK. The seed will recreate built-in formats on next
    # startup if needed.
    db.delete(fmt)
    db.commit()
    return {"ok": True}
