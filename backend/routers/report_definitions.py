from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models, schemas

router = APIRouter(prefix="/report-definitions", tags=["report-definitions"])


def _base_query(db: Session):
    return db.query(models.ReportDefinition).options(
        joinedload(models.ReportDefinition.sections).joinedload(
            models.ReportDefinitionSection.report_section
        )
    )


def _upsert_sections(
    db: Session, definition: models.ReportDefinition, sections: list[schemas.ReportDefinitionSectionIn] | list[dict]
) -> None:
    db.query(models.ReportDefinitionSection).filter(
        models.ReportDefinitionSection.report_definition_id == definition.id
    ).delete()
    for row in sections:
        if isinstance(row, dict):
            section_id = row.get("report_section_id")
            position = row.get("position")
        else:
            section_id = row.report_section_id
            position = row.position
        sec = db.query(models.ReportSection).filter(models.ReportSection.id == section_id).first()
        if not sec:
            raise HTTPException(404, detail=f"Report section '{section_id}' not found")
        db.add(
            models.ReportDefinitionSection(
                report_definition_id=definition.id,
                report_section_id=section_id,
                position=position,
            )
        )
    definition.version = (definition.version or 1) + 1


@router.get("/", response_model=List[schemas.ReportDefinitionOut])
def list_report_definitions(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    q = _base_query(db)
    if active_only:
        q = q.filter(models.ReportDefinition.active == True)
    return q.order_by(models.ReportDefinition.sort_order, models.ReportDefinition.name).all()


@router.get("/{definition_id}", response_model=schemas.ReportDefinitionOut)
def get_report_definition(definition_id: str, db: Session = Depends(get_db)):
    row = _base_query(db).filter(models.ReportDefinition.id == definition_id).first()
    if not row:
        raise HTTPException(404, detail="Report definition not found")
    return row


@router.post("/", response_model=schemas.ReportDefinitionOut)
def create_report_definition(body: schemas.ReportDefinitionCreate, db: Session = Depends(get_db)):
    if db.query(models.ReportDefinition).filter(models.ReportDefinition.key == body.key).first():
        raise HTTPException(400, detail=f"Report definition key '{body.key}' already exists")
    row = models.ReportDefinition(
        key=body.key,
        name=body.name,
        description=body.description,
        active=body.active,
        sort_order=body.sort_order,
        version=1,
    )
    db.add(row)
    db.flush()
    _upsert_sections(db, row, body.sections)
    db.commit()
    db.refresh(row)
    return _base_query(db).filter(models.ReportDefinition.id == row.id).first()


@router.patch("/{definition_id}", response_model=schemas.ReportDefinitionOut)
def update_report_definition(
    definition_id: str, body: schemas.ReportDefinitionUpdate, db: Session = Depends(get_db)
):
    row = db.query(models.ReportDefinition).filter(models.ReportDefinition.id == definition_id).first()
    if not row:
        raise HTTPException(404, detail="Report definition not found")

    updates = body.model_dump(exclude_unset=True)
    if "key" in updates and updates["key"] != row.key:
        conflict = db.query(models.ReportDefinition).filter(models.ReportDefinition.key == updates["key"]).first()
        if conflict:
            raise HTTPException(400, detail=f"Report definition key '{updates['key']}' already exists")
    sections = updates.pop("sections", None)
    for k, v in updates.items():
        setattr(row, k, v)
    if sections is not None:
        _upsert_sections(db, row, sections)
    db.commit()
    return _base_query(db).filter(models.ReportDefinition.id == definition_id).first()


@router.delete("/{definition_id}")
def delete_report_definition(definition_id: str, db: Session = Depends(get_db)):
    row = db.query(models.ReportDefinition).filter(models.ReportDefinition.id == definition_id).first()
    if not row:
        raise HTTPException(404, detail="Report definition not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
