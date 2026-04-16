from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/", response_model=List[schemas.AIModelOut])
def list_models(db: Session = Depends(get_db)):
    return (
        db.query(models.AIModel)
        .filter(models.AIModel.active == True)
        .order_by(models.AIModel.provider, models.AIModel.name)
        .all()
    )


@router.get("/all", response_model=List[schemas.AIModelOut])
def list_all_models(db: Session = Depends(get_db)):
    return db.query(models.AIModel).order_by(models.AIModel.provider, models.AIModel.name).all()


@router.post("/", response_model=schemas.AIModelOut)
def create_model(body: schemas.AIModelCreate, db: Session = Depends(get_db)):
    model = models.AIModel(**body.model_dump())
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.get("/{model_id}", response_model=schemas.AIModelOut)
def get_model(model_id: str, db: Session = Depends(get_db)):
    model = db.query(models.AIModel).filter(models.AIModel.id == model_id).first()
    if not model:
        raise HTTPException(404, detail="Model not found")
    return model


@router.patch("/{model_id}", response_model=schemas.AIModelOut)
def update_model(model_id: str, body: schemas.AIModelUpdate, db: Session = Depends(get_db)):
    model = db.query(models.AIModel).filter(models.AIModel.id == model_id).first()
    if not model:
        raise HTTPException(404, detail="Model not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(model, k, v)
    db.commit()
    db.refresh(model)
    return model


@router.delete("/{model_id}")
def delete_model(model_id: str, db: Session = Depends(get_db)):
    model = db.query(models.AIModel).filter(models.AIModel.id == model_id).first()
    if not model:
        raise HTTPException(404, detail="Model not found")
    db.delete(model)
    db.commit()
    return {"ok": True}
