from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas

router = APIRouter(prefix="/report-templates", tags=["report-templates"])


@router.get("/", response_model=List[schemas.ReportTemplateOut])
def list_report_templates(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    q = db.query(models.ReportTemplate)
    if active_only:
        q = q.filter(models.ReportTemplate.active == True)
    return q.order_by(models.ReportTemplate.sort_order, models.ReportTemplate.label).all()


@router.get("/{template_id}", response_model=schemas.ReportTemplateOut)
def get_report_template(template_id: str, db: Session = Depends(get_db)):
    template = (
        db.query(models.ReportTemplate)
        .filter(models.ReportTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(404, detail="Report template not found")
    return template


@router.post("/", response_model=schemas.ReportTemplateOut)
def create_report_template(body: schemas.ReportTemplateCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.ReportTemplate)
        .filter(models.ReportTemplate.key == body.key)
        .first()
    )
    if existing:
        raise HTTPException(400, detail=f"Template key '{body.key}' already exists")
    template = models.ReportTemplate(**body.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/{template_id}", response_model=schemas.ReportTemplateOut)
def update_report_template(
    template_id: str, body: schemas.ReportTemplateUpdate, db: Session = Depends(get_db)
):
    template = (
        db.query(models.ReportTemplate)
        .filter(models.ReportTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(404, detail="Report template not found")

    updates = body.model_dump(exclude_unset=True)
    if "key" in updates and updates["key"] != template.key:
        conflict = (
            db.query(models.ReportTemplate)
            .filter(models.ReportTemplate.key == updates["key"])
            .first()
        )
        if conflict:
            raise HTTPException(400, detail=f"Template key '{updates['key']}' already exists")

    for k, v in updates.items():
        setattr(template, k, v)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}")
def delete_report_template(template_id: str, db: Session = Depends(get_db)):
    template = (
        db.query(models.ReportTemplate)
        .filter(models.ReportTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(404, detail="Report template not found")
    db.delete(template)
    db.commit()
    return {"ok": True}
