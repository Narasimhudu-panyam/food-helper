from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BusinessType
from app.schemas.common import LocationCoordinates


class FoodBusinessBase(BaseModel):
    business_name: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Legal or commercial name of the food establishment",
    )
    business_type: BusinessType = Field(
        ...,
        description="Category of commercial food provider",
    )
    address_text: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Physical street address",
    )
    contact_phone: str = Field(
        ...,
        min_length=5,
        max_length=50,
        description="Direct telephone number for pickup inquiries",
    )
    pickup_instructions: Optional[str] = Field(
        None,
        max_length=1000,
        description="Specific instructions for drivers (e.g. back door code, loading dock)",
    )


class FoodBusinessCreate(FoodBusinessBase):
    location: LocationCoordinates = Field(
        ...,
        description="Exact geographic coordinate for mapping and radius filtering",
    )


class FoodBusinessUpdate(BaseModel):
    business_name: Optional[str] = Field(None, min_length=2, max_length=255)
    business_type: Optional[BusinessType] = None
    address_text: Optional[str] = Field(None, min_length=5, max_length=500)
    location: Optional[LocationCoordinates] = None
    contact_phone: Optional[str] = Field(None, min_length=5, max_length=50)
    pickup_instructions: Optional[str] = Field(None, max_length=1000)


class FoodBusinessResponse(FoodBusinessBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    location: LocationCoordinates
    created_at: datetime
    updated_at: datetime
