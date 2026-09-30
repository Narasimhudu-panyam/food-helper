from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PickupStatus, TransportMode, VehicleType


class PickupCreateRequest(BaseModel):
    scheduled_pickup_time: Optional[datetime] = Field(
        None,
        description="Preferred scheduled time for surplus food pickup",
    )
    transport_mode: Optional[TransportMode] = Field(
        TransportMode.ORG_DIRECT,
        description="Logistics transport mode (ORG_DIRECT or VOLUNTEER)",
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Logistical notes, loading dock instructions, or special access codes",
    )


class PickupCancelRequest(BaseModel):
    cancellation_reason: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Mandatory reason for cancelling active pickup",
    )


class PickupFailRequest(BaseModel):
    failure_reason: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Mandatory reason for failed pickup/delivery attempt",
    )


class CandidateVolunteerMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    volunteer_id: UUID
    full_name: str
    vehicle_type: VehicleType
    has_insulated_bags: bool
    distance_km: float
    distance_meters: float
    service_radius_km: float
    score: float
    rank: int
    match_reasons: List[str]


class PickupVolunteerMatchListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pickup_id: UUID
    total_candidates_found: int
    matches: List[CandidateVolunteerMatchResponse]


class PickupAssignVolunteerRequest(BaseModel):
    volunteer_id: Optional[UUID] = Field(
        None,
        description="ID of the volunteer courier claiming or assigned this transport task (optional for self-assigning volunteers)",
    )


class PickupStatusUpdateRequest(BaseModel):
    status: PickupStatus = Field(
        ...,
        description="Target logistics status (e.g. EN_ROUTE_TO_PICKUP, ARRIVED_AT_PICKUP)",
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional status update notes or delivery observations",
    )


class PickupVerifyHandoffRequest(BaseModel):
    handoff_pin: str = Field(
        ...,
        min_length=6,
        max_length=6,
        description="6-digit verification PIN provided by donor kitchen at handoff",
        examples=["482910"],
    )


class PickupVerifyDeliveryRequest(BaseModel):
    dropoff_confirmation_pin: Optional[str] = Field(
        None,
        min_length=6,
        max_length=6,
        description="Optional recipient inspection/confirmation code",
        examples=["839201"],
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Inspection notes (e.g. temperature logged at receipt, condition verified)",
    )


class PickupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    donation_id: UUID
    organization_id: UUID
    volunteer_id: Optional[UUID] = None
    transport_mode: TransportMode
    status: PickupStatus
    scheduled_pickup_time: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
