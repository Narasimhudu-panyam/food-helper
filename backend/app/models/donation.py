import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import DonationStatus, FoodCategory, QuantityUnit, StorageCondition

if TYPE_CHECKING:
    from app.models.business import FoodBusiness
    from app.models.match import DonationMatch
    from app.models.pickup import Pickup


class Donation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "donations"
    __table_args__ = (
        CheckConstraint("quantity_value > 0", name="ck_donation_qty_positive"),
        CheckConstraint("total_weight_kg > 0", name="ck_donation_weight_positive"),
        CheckConstraint("pickup_deadline > available_from", name="ck_donation_pickup_window"),
        CheckConstraint(
            "safe_consumption_deadline >= pickup_deadline",
            name="ck_donation_consumption_window",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("food_businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    food_category: Mapped[FoodCategory] = mapped_column(
        Enum(FoodCategory, name="food_category", native_enum=True),
        nullable=False,
        index=True,
    )
    quantity_value: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    quantity_unit: Mapped[QuantityUnit] = mapped_column(
        Enum(QuantityUnit, name="quantity_unit", native_enum=True),
        nullable=False,
    )
    total_weight_kg: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    storage_condition: Mapped[StorageCondition] = mapped_column(
        Enum(StorageCondition, name="storage_condition", native_enum=True),
        nullable=False,
    )
    packaging_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    preparation_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    available_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    pickup_deadline: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    safe_consumption_deadline: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    location: Mapped[Geography] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=False,
    )
    pickup_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    image_url: Mapped[Optional[str]] = mapped_column(
        String(1000),
        nullable=True,
    )
    status: Mapped[DonationStatus] = mapped_column(
        Enum(DonationStatus, name="donation_status", native_enum=True),
        default=DonationStatus.CREATED,
        nullable=False,
        index=True,
    )
    handoff_pin: Mapped[Optional[str]] = mapped_column(
        String(6),
        nullable=True,
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    business: Mapped["FoodBusiness"] = relationship("FoodBusiness", back_populates="donations")
    matches: Mapped[List["DonationMatch"]] = relationship(
        "DonationMatch",
        back_populates="donation",
        cascade="all, delete-orphan",
    )
    pickup: Mapped[Optional["Pickup"]] = relationship(
        "Pickup",
        back_populates="donation",
        uselist=False,
        cascade="all, delete-orphan",
    )
