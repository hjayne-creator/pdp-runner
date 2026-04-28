from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models, schemas

router = APIRouter(prefix="/report-types", tags=["report-types"])


def _validate_default_prompt(db: Session, prompt_id: str | None) -> None:
    if not prompt_id:
        return
    exists = db.query(models.Prompt).filter(models.Prompt.id == prompt_id).first()
    if not exists:
        raise HTTPException(404, detail=f"Default prompt '{prompt_id}' not found")


def _validate_report_definition(db: Session, definition_id: str | None) -> None:
    if not definition_id:
        return
    exists = (
        db.query(models.ReportDefinition)
        .filter(models.ReportDefinition.id == definition_id)
        .first()
    )
    if not exists:
        raise HTTPException(404, detail=f"Report definition '{definition_id}' not found")


def _base_query(db: Session):
    return db.query(models.ReportType).options(
        joinedload(models.ReportType.report_definition).joinedload(
            models.ReportDefinition.sections
        ).joinedload(models.ReportDefinitionSection.report_section),
    )


@router.get("/", response_model=List[schemas.ReportTypeOut])
def list_report_types(
    active_only: bool = Query(True),
    workflow: str | None = Query(None, description="Filter by workflow (retail | house_brand)"),
    db: Session = Depends(get_db),
):
    q = _base_query(db)
    if active_only:
        q = q.filter(models.ReportType.active == True)
    if workflow:
        q = q.filter(models.ReportType.workflow == workflow)
    return q.order_by(models.ReportType.sort_order, models.ReportType.label).all()


@router.get("/{type_id}", response_model=schemas.ReportTypeOut)
def get_report_type(type_id: str, db: Session = Depends(get_db)):
    rt = _base_query(db).filter(models.ReportType.id == type_id).first()
    if not rt:
        raise HTTPException(404, detail="Report type not found")
    return rt


@router.post("/", response_model=schemas.ReportTypeOut)
def create_report_type(body: schemas.ReportTypeCreate, db: Session = Depends(get_db)):
    if db.query(models.ReportType).filter(models.ReportType.key == body.key).first():
        raise HTTPException(400, detail=f"Report type key '{body.key}' already exists")
    _validate_default_prompt(db, body.default_prompt_id)
    _validate_report_definition(db, body.report_definition_id)
    rt = models.ReportType(**body.model_dump())
    db.add(rt)
    db.commit()
    db.refresh(rt)
    return rt


@router.patch("/{type_id}", response_model=schemas.ReportTypeOut)
def update_report_type(
    type_id: str, body: schemas.ReportTypeUpdate, db: Session = Depends(get_db)
):
    rt = db.query(models.ReportType).filter(models.ReportType.id == type_id).first()
    if not rt:
        raise HTTPException(404, detail="Report type not found")

    updates = body.model_dump(exclude_unset=True)
    if "key" in updates and updates["key"] != rt.key:
        conflict = (
            db.query(models.ReportType)
            .filter(models.ReportType.key == updates["key"])
            .first()
        )
        if conflict:
            raise HTTPException(400, detail=f"Report type key '{updates['key']}' already exists")
    if "default_prompt_id" in updates:
        _validate_default_prompt(db, updates["default_prompt_id"])
    if "report_definition_id" in updates:
        _validate_report_definition(db, updates["report_definition_id"])

    for k, v in updates.items():
        setattr(rt, k, v)

    db.commit()
    db.refresh(rt)
    return rt


@router.delete("/{type_id}")
def delete_report_type(type_id: str, db: Session = Depends(get_db)):
    rt = db.query(models.ReportType).filter(models.ReportType.id == type_id).first()
    if not rt:
        raise HTTPException(404, detail="Report type not found")
    db.delete(rt)
    db.commit()
    return {"ok": True}
