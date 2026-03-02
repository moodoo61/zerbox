from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlmodel import Session, select
from passlib.context import CryptContext

from backend.database import get_session
from backend.models import AdminUser

security = HTTPBasic()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def check_auth(
    credentials: HTTPBasicCredentials = Depends(security),
    session: Session = Depends(get_session),
) -> AdminUser:
    """مصادقة المستخدم وإرجاع كائن AdminUser كاملاً."""
    user = session.exec(
        select(AdminUser).where(AdminUser.username == credentials.username)
    ).first()
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    if not pwd_ctx.verify(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    if not user.is_active and user.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="الحساب معطّل. تواصل مع المسؤول.",
        )
    return user
