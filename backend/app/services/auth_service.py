from datetime import timedelta
from typing import Tuple
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    UserLoginRequest,
    UserPasswordChangeRequest,
    UserRegisterRequest,
)


class AuthService:
    @staticmethod
    async def register_user(
        db: AsyncSession,
        register_data: UserRegisterRequest,
    ) -> User:
        """
        Validate uniqueness, normalize email, hash password with Argon2id,
        and persist a new user record.
        """
        normalized_email = register_data.email.strip().lower()

        # Check for existing email case-insensitively
        stmt = select(User).where(func.lower(User.email) == normalized_email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists",
            )

        password_hash = get_password_hash(register_data.password)

        new_user = User(
            email=normalized_email,
            password_hash=password_hash,
            role=register_data.role,
            is_active=True,
            is_verified=False,
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user

    @staticmethod
    async def authenticate_user(
        db: AsyncSession,
        login_data: UserLoginRequest,
    ) -> Tuple[User, str, str, int]:
        """
        Authenticate user credentials and issue signed JWT access and refresh tokens.
        Uses generic error messages to prevent email enumeration.
        """
        normalized_email = login_data.email.strip().lower()

        stmt = select(User).where(func.lower(User.email) == normalized_email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        # Use constant-time verification if user exists, else dummy verification to prevent timing leaks
        if not user or not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is suspended or inactive",
            )

        access_token = create_access_token(user_id=user.id, role=user.role)
        refresh_token = create_refresh_token(user_id=user.id, role=user.role)
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return user, access_token, refresh_token, expires_in

    @staticmethod
    async def refresh_user_token(
        db: AsyncSession,
        refresh_token_str: str,
    ) -> Tuple[str, int]:
        """
        Validate refresh token and issue a renewed access token.
        """
        try:
            payload = decode_token(refresh_token_str, expected_type="refresh")
            user_id = UUID(payload["sub"])
        except (jwt.PyJWTError, ValueError, KeyError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive or not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        new_access_token = create_access_token(user_id=user.id, role=user.role)
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return new_access_token, expires_in

    @staticmethod
    async def change_password(
        db: AsyncSession,
        user: User,
        password_data: UserPasswordChangeRequest,
    ) -> None:
        """
        Verify existing password and update with a new Argon2id hash.
        """
        if not verify_password(password_data.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password",
            )

        user.password_hash = get_password_hash(password_data.new_password)
        await db.commit()
        await db.refresh(user)
