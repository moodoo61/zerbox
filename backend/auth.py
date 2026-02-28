from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlmodel import Session
from passlib.context import CryptContext

from backend.database import get_session, get_or_create_admin_user
from backend.models import AdminUser

security = HTTPBasic()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def check_auth(
    credentials: HTTPBasicCredentials = Depends(security),
    session: Session = Depends(get_session),
):
    admin = get_or_create_admin_user(session)
    if not admin or not admin.password_hash:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin account not configured",
            headers={"WWW-Authenticate": "Basic"},
        )
    if credentials.username != admin.username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    if not pwd_ctx.verify(credentials.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username
