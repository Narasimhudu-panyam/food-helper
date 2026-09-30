import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import UUIDMixin
from app.models.enums import MatchStatus

if TYPE_CHECKING:
    from app.models.donation import Donation
    from app.models.organization import Organization


class DonationMatch(Base, UUIDMixin):
    __tablename__ = "donation_matches"
    __table_args__ = (
        UniqueConstraint("donation_id", "organization_id", name="uq_donation_org_match"),
        CheckConstraint("rank_order >= 1", name="ck_match_rank_positive"),
        CheckConstraint("score >= 0.0 AND score <= 100.0", name="ck_match_score_range"),
        CheckConstraint("distance_meters >= 0.0", name="ck_match_distance_non_negative"),
    )

    donation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("donations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    distance_meters: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
    )
    rank_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="match_status", native_enum=True),
        default=MatchStatus.PROPOSED,
        nullable=False,
        index=True,
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    invited_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    donation: Mapped["Donation"] = relationship("Donation", back_populates="matches")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="matches")
