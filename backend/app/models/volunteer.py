import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import VehicleType

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.pickup import Pickup


class Volunteer(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "volunteers"
    __table_args__ = (
        CheckConstraint("service_radius_km > 0", name="ck_volunteer_radius_positive"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    contact_phone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    vehicle_type: Mapped[VehicleType] = mapped_column(
        Enum(VehicleType, name="vehicle_type", native_enum=True),
        nullable=False,
    )
    has_insulated_bags: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    home_location: Mapped[Optional[Geography]] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )
    service_radius_km: Mapped[float] = mapped_column(
        Numeric(5, 2),
        default=10.0,
        nullable=False,
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="volunteer")
    pickups: Mapped[List["Pickup"]] = relationship(
        "Pickup",
        back_populates="volunteer",
    )
