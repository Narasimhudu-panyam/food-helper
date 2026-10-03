import re
from typing import Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User


class AdminProvisionService:
    """
    Dedicated service for safe, idempotent provisioning of system administrator accounts.
    Enforces strict email formatting, password policies, and prevents role collisions.
    """

    @classmethod
    def validate_admin_email(cls, email: str) -> str:
        """Validate and normalize an administrator email address."""
        if not email or not isinstance(email, str):
            raise ValueError("Admin email must be a non-empty string")
        email = email.strip().lower()
        try:
            TypeAdapter(EmailStr).validate_python(email)
        except ValidationError as e:
            raise ValueError(f"Invalid email format: {email}") from e
        return email

    @classmethod
    def validate_admin_password(cls, password: str) -> str:
        """Validate administrator password complexity and length constraints."""
        if not password or not isinstance(password, str):
            raise ValueError("Admin password must be a non-empty string")
        if len(password) < 8:
            raise ValueError("Admin password must be at least 8 characters long")
        if len(password) > 128:
            raise ValueError("Admin password cannot exceed 128 characters")
        return password

    @classmethod
    async def provision_admin(
        cls,
        db: AsyncSession,
        email: str,
        password: str,
        promote_existing: bool = False,
    ) -> Tuple[User, bool]:
        """
        Provision an ADMIN user account in the database.

        Returns:
            Tuple[User, bool]: (User entity, created_flag)
            - If created is True: new ADMIN account was created or existing user promoted.
            - If created is False: existing ADMIN account was found (idempotent).

        Raises:
            ValueError: If inputs are invalid or email is already taken by a non-ADMIN user without promote_existing.
        """
        normalized_email = cls.validate_admin_email(email)
        validated_password = cls.validate_admin_password(password)

        # Query existing user case-insensitively
        stmt = select(User).where(func.lower(User.email) == normalized_email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            if existing_user.role == UserRole.ADMIN:
                # Idempotent return without modifying or exposing password
                return existing_user, False
            elif promote_existing:
                existing_user.role = UserRole.ADMIN
                existing_user.is_verified = True
                existing_user.is_active = True
                existing_user.password_hash = get_password_hash(validated_password)
                await db.commit()
                await db.refresh(existing_user)
                return existing_user, True
            else:
                raise ValueError(
                    f"A user with email '{normalized_email}' already exists with role '{existing_user.role.value}'. "
                    "Refusing to overwrite non-admin user without explicit promote flag."
                )

        # Hash with Argon2id and create ADMIN user
        password_hash = get_password_hash(validated_password)
        admin_user = User(
            email=normalized_email,
            password_hash=password_hash,
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
        )

        db.add(admin_user)
        await db.commit()
        await db.refresh(admin_user)

        return admin_user, True
