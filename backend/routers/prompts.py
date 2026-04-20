from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models, schemas

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("/", response_model=List[schemas.PromptOut])
def list_prompts(
    customer_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    q = db.query(models.Prompt)
    if customer_id:
        q = q.filter(models.Prompt.customer_id == customer_id)
    if active_only:
        q = q.filter(models.Prompt.active == True)
    return q.order_by(models.Prompt.name).all()


@router.post("/", response_model=schemas.PromptOut)
def create_prompt(body: schemas.PromptCreate, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).filter(models.Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(404, detail="Customer not found")
    prompt = models.Prompt(**body.model_dump())
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return prompt


@router.get("/{prompt_id}", response_model=schemas.PromptOut)
def get_prompt(prompt_id: str, db: Session = Depends(get_db)):
    prompt = db.query(models.Prompt).filter(models.Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(404, detail="Prompt not found")
    return prompt


@router.patch("/{prompt_id}", response_model=schemas.PromptOut)
def update_prompt(prompt_id: str, body: schemas.PromptUpdate, db: Session = Depends(get_db)):
    prompt = db.query(models.Prompt).filter(models.Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(404, detail="Prompt not found")

    updates = body.model_dump(exclude_unset=True)
    if "customer_id" in updates:
        new_cid = updates["customer_id"]
        if not new_cid:
            raise HTTPException(400, detail="customer_id cannot be empty")
        cust = db.query(models.Customer).filter(models.Customer.id == new_cid).first()
        if not cust:
            raise HTTPException(404, detail="Customer not found")

    if "content" in updates:
        # Bump version on content change
        prompt.version = prompt.version + 1
    for k, v in updates.items():
        setattr(prompt, k, v)

    db.commit()
    db.refresh(prompt)
    return prompt


@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_db)):
    prompt = db.query(models.Prompt).filter(models.Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(404, detail="Prompt not found")
    db.delete(prompt)
    db.commit()
    return {"ok": True}
