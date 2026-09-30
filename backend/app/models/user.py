import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.business import FoodBusiness
    from app.models.organization import Organization
    from app.models.volunteer import Volunteer
    from app.models.notification import Notification
    from app.models.audit import AuditLog


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=True),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # 1:1 Profile relationships
    food_business: Mapped[Optional["FoodBusiness"]] = relationship(
        "FoodBusiness",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    volunteer: Mapped[Optional["Volunteer"]] = relationship(
        "Volunteer",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # 1:N relations
    notifications: Mapped[List["Notification"]] = relationship(
        "Notification",
        back_populates="recipient",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="actor",
    )
