import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import OrgType, OrgVerificationStatus

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.match import DonationMatch
    from app.models.pickup import Pickup


class Organization(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint("max_capacity_kg >= 0", name="ck_org_max_capacity_positive"),
        CheckConstraint(
            "current_capacity_kg >= 0 AND current_capacity_kg <= max_capacity_kg",
            name="ck_org_current_capacity_valid",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    org_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    org_type: Mapped[OrgType] = mapped_column(
        Enum(OrgType, name="org_type", native_enum=True),
        nullable=False,
    )
    tax_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    address_text: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    location: Mapped[Geography] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )
    contact_phone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    verification_status: Mapped[OrgVerificationStatus] = mapped_column(
        Enum(OrgVerificationStatus, name="org_verification_status", native_enum=True),
        default=OrgVerificationStatus.PENDING,
        nullable=False,
        index=True,
    )
    max_capacity_kg: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=0.0,
    )
    current_capacity_kg: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=0.0,
    )
    accepted_categories: Mapped[List[str]] = mapped_column(
        ARRAY(String(50)),
        nullable=False,
        default=list,
    )
    can_pickup: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    operating_hours: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="organization")
    matches: Mapped[List["DonationMatch"]] = relationship(
        "DonationMatch",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    pickups: Mapped[List["Pickup"]] = relationship(
        "Pickup",
        back_populates="organization",
    )
