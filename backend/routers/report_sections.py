from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas

router = APIRouter(prefix="/report-sections", tags=["report-sections"])


@router.get("/", response_model=List[schemas.ReportSectionOut])
def list_report_sections(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    q = db.query(models.ReportSection)
    if active_only:
        q = q.filter(models.ReportSection.active == True)
    return q.order_by(models.ReportSection.sort_order, models.ReportSection.label).all()
