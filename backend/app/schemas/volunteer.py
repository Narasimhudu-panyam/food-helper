from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import VehicleType
from app.schemas.common import LocationCoordinates


class VolunteerBase(BaseModel):
    full_name: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Full legal name of volunteer driver",
    )
    contact_phone: str = Field(
        ...,
        min_length=5,
        max_length=50,
        description="Mobile phone for delivery coordination",
    )
    vehicle_type: VehicleType = Field(
        ...,
        description="Primary transport method (FOOT_BIKE, CAR, VAN_TRUCK, OTHER)",
    )
    has_insulated_bags: bool = Field(
        default=False,
        description="Whether volunteer possesses temperature-maintaining cooler/hot bags",
    )
    service_radius_km: Decimal = Field(
        default=Decimal("10.0"),
        gt=0,
        le=Decimal("100.0"),
        description="Maximum travel radius from home base in kilometers",
    )


class VolunteerCreate(VolunteerBase):
    home_location: Optional[LocationCoordinates] = Field(
        None,
        description="Home base / departure point coordinates",
    )


class VolunteerUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    contact_phone: Optional[str] = Field(None, min_length=5, max_length=50)
    vehicle_type: Optional[VehicleType] = None
    has_insulated_bags: Optional[bool] = None
    home_location: Optional[LocationCoordinates] = None
    service_radius_km: Optional[Decimal] = Field(None, gt=0, le=Decimal("100.0"))
    is_available: Optional[bool] = Field(None, description="Active status toggle for receiving dispatch alerts")


class VolunteerResponse(VolunteerBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    home_location: Optional[LocationCoordinates]
    is_available: bool
    created_at: datetime
    updated_at: datetime
