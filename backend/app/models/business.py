import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import BusinessType

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.donation import Donation


class FoodBusiness(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "food_businesses"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    business_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    business_type: Mapped[BusinessType] = mapped_column(
        Enum(BusinessType, name="business_type", native_enum=True),
        nullable=False,
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
    pickup_instructions: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="food_business")
    donations: Mapped[List["Donation"]] = relationship(
        "Donation",
        back_populates="business",
        cascade="all, delete-orphan",
    )
