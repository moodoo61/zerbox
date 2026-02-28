"""عمليات CRUD الأساسية للخدمات المخصصة."""
from typing import List, Optional
from sqlmodel import Session, select
from .. import models


def create_service(db: Session, service: models.ServiceCreate) -> models.Service:
    db_service = models.Service.from_orm(service)
    db.add(db_service)
    db.commit()
    db.refresh(db_service)
    return db_service


def get_services(db: Session, skip: int = 0, limit: int = 100) -> List[models.Service]:
    statement = select(models.Service).offset(skip).limit(limit)
    return db.exec(statement).all()


def get_service(db: Session, service_id: int) -> Optional[models.Service]:
    return db.get(models.Service, service_id)


def update_service(db: Session, service_id: int, service_data: models.ServiceUpdate) -> Optional[models.Service]:
    db_service = db.get(models.Service, service_id)
    if db_service:
        service_update_data = service_data.dict(exclude_unset=True)
        for key, value in service_update_data.items():
            setattr(db_service, key, value)
        db.add(db_service)
        db.commit()
        db.refresh(db_service)
    return db_service


def delete_service(db: Session, service_id: int) -> bool:
    db_service = db.get(models.Service, service_id)
    if db_service:
        db.delete(db_service)
        db.commit()
        return True
    return False


def increment_click_count(db: Session, service_id: int) -> Optional[models.Service]:
    db_service = db.get(models.Service, service_id)
    if db_service:
        db_service.click_count += 1
        db.add(db_service)
        db.commit()
        db.refresh(db_service)
    return db_service
