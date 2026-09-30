from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import DonationStatus, FoodCategory, QuantityUnit, StorageCondition
from app.schemas.common import LocationCoordinates


class DonationBase(BaseModel):
    title: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Brief descriptive summary of surplus food batch",
        examples=["5 Trays of Fresh Vegetable Lasagna"],
    )
    food_category: FoodCategory = Field(
        ...,
        description="Classification of food item for dietary compatibility filtering",
    )
    quantity_value: Decimal = Field(
        ...,
        gt=0,
        description="Numeric quantity count (must be positive)",
        examples=[5.0],
    )
    quantity_unit: QuantityUnit = Field(
        ...,
        description="Measurement unit (KG, PORTIONS, TRAYS, BOXES, ITEMS)",
    )
    total_weight_kg: Decimal = Field(
        ...,
        gt=0,
        description="Estimated total mass in kilograms for capacity planning",
        examples=[12.5],
    )
    storage_condition: StorageCondition = Field(
        ...,
        description="Required storage temperature regime",
    )
    packaging_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Physical packaging condition (e.g. Sealed Foil Trays, Cardboard Boxes)",
    )
    preparation_time: Optional[datetime] = Field(
        None,
        description="When cooked/prepared (for time-temperature control tracking)",
    )
    available_from: Optional[datetime] = Field(
        None,
        description="Earliest time food is packaged and ready for collection (defaults to listing time)",
    )
    pickup_deadline: datetime = Field(
        ...,
        description="Latest time food must be picked up before donor facility closes",
    )
    safe_consumption_deadline: datetime = Field(
        ...,
        description="Absolute safe consumption deadline based on food safety guidelines",
    )
    pickup_notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Specific instructions for this batch",
    )
    image_url: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional image verification URL",
    )


class DonationCreate(DonationBase):
    location: LocationCoordinates = Field(
        ...,
        description="Physical pickup location coordinates",
    )

    @model_validator(mode="after")
    def validate_deadlines(self) -> "DonationCreate":
        # Ensure pickup deadline is after available_from if provided
        if self.available_from and self.pickup_deadline <= self.available_from:
            raise ValueError("pickup_deadline must be strictly after available_from")

        # Ensure safe consumption deadline is on or after pickup deadline
        if self.safe_consumption_deadline < self.pickup_deadline:
            raise ValueError("safe_consumption_deadline cannot be earlier than pickup_deadline")

        # Ensure safe consumption deadline is after preparation time if provided
        if self.preparation_time and self.safe_consumption_deadline <= self.preparation_time:
            raise ValueError("safe_consumption_deadline must be strictly after preparation_time")

        return self


class DonationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    food_category: Optional[FoodCategory] = None
    quantity_value: Optional[Decimal] = Field(None, gt=0)
    quantity_unit: Optional[QuantityUnit] = None
    total_weight_kg: Optional[Decimal] = Field(None, gt=0)
    storage_condition: Optional[StorageCondition] = None
    packaging_type: Optional[str] = Field(None, min_length=1, max_length=100)
    preparation_time: Optional[datetime] = None
    available_from: Optional[datetime] = None
    pickup_deadline: Optional[datetime] = None
    safe_consumption_deadline: Optional[datetime] = None
    location: Optional[LocationCoordinates] = None
    pickup_notes: Optional[str] = Field(None, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def validate_update_deadlines(self) -> "DonationUpdate":
        if self.pickup_deadline and self.available_from:
            if self.pickup_deadline <= self.available_from:
                raise ValueError("pickup_deadline must be strictly after available_from")

        if self.safe_consumption_deadline and self.pickup_deadline:
            if self.safe_consumption_deadline < self.pickup_deadline:
                raise ValueError("safe_consumption_deadline cannot be earlier than pickup_deadline")

        return self


class DonationCancelRequest(BaseModel):
    cancellation_reason: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Mandatory reason for cancelling active donation listing",
    )


class DonationResponse(DonationBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_id: UUID
    available_from: datetime
    location: LocationCoordinates
    status: DonationStatus
    handoff_pin: Optional[str] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DonationSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_id: UUID
    title: str
    food_category: FoodCategory
    quantity_value: Decimal
    quantity_unit: QuantityUnit
    total_weight_kg: Decimal
    storage_condition: StorageCondition
    pickup_deadline: datetime
    safe_consumption_deadline: datetime
    status: DonationStatus
    created_at: datetime
