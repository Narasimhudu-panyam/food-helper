import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import PickupStatus, TransportMode

if TYPE_CHECKING:
    from app.models.donation import Donation
    from app.models.organization import Organization
    from app.models.volunteer import Volunteer


class Pickup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "pickups"
    __table_args__ = (
        CheckConstraint(
            "delivered_at IS NULL OR picked_up_at IS NULL OR delivered_at >= picked_up_at",
            name="ck_pickup_delivery_time_valid",
        ),
    )

    donation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("donations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    volunteer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("volunteers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    transport_mode: Mapped[TransportMode] = mapped_column(
        Enum(TransportMode, name="transport_mode", native_enum=True),
        nullable=False,
    )
    status: Mapped[PickupStatus] = mapped_column(
        Enum(PickupStatus, name="pickup_status", native_enum=True),
        default=PickupStatus.ASSIGNED,
        nullable=False,
        index=True,
    )
    scheduled_pickup_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    picked_up_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    delivered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    dropoff_confirmation_pin: Mapped[Optional[str]] = mapped_column(
        String(6),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    donation: Mapped["Donation"] = relationship("Donation", back_populates="pickup")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="pickups")
    volunteer: Mapped[Optional["Volunteer"]] = relationship("Volunteer", back_populates="pickups")
