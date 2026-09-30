from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MatchStatus, TransportMode


class MatchOfferCreate(BaseModel):
    organization_id: UUID = Field(
        ...,
        description="Recipient organization UUID to send donation match offer to",
    )


class MatchAcceptRequest(BaseModel):
    transport_mode: TransportMode = Field(
        ...,
        description="Designates whether organization will pick up directly or request a volunteer courier",
    )


class MatchDeclineRequest(BaseModel):
    rejection_reason: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Feedback reason for declining the match (e.g. storage full, dietary mismatch)",
    )


class MatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    donation_id: UUID
    organization_id: UUID
    distance_meters: Decimal
    score: Decimal
    rank_order: int
    status: MatchStatus
    rejection_reason: Optional[str] = None
    invited_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    created_at: datetime


class CandidateMatchResponse(BaseModel):
    organization_id: UUID = Field(..., description="Unique identifier of eligible recipient organization")
    org_name: str = Field(..., description="Legal/operating name of recipient organization")
    org_type: str = Field(..., description="Organization category classification (e.g. FOOD_BANK, SHELTER)")
    distance_km: float = Field(..., description="Geodesic distance from pickup location in kilometers")
    distance_meters: float = Field(..., description="Precise distance in meters calculated by PostGIS")
    available_capacity_kg: float = Field(..., description="Available storage capacity in kilograms")
    max_capacity_kg: float = Field(..., description="Total maximum storage capacity in kilograms")
    current_capacity_kg: float = Field(..., description="Current occupied storage capacity in kilograms")
    score: float = Field(..., description="Deterministic matching composite score (0.0 to 100.0)")
    rank: int = Field(..., description="Deterministic ranking order (1 = highest match)")
    match_reasons: list[str] = Field(..., description="List of rule-based explanations for candidate suitability")


class DonationMatchListResponse(BaseModel):
    donation_id: UUID = Field(..., description="ID of the evaluated surplus food donation")
    total_candidates_found: int = Field(..., description="Total number of eligible organizations meeting all hard constraints")
    matches: list[CandidateMatchResponse] = Field(..., description="Ranked list of eligible candidate organizations")
