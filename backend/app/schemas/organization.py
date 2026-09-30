from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import FoodCategory, OrgType, OrgVerificationStatus
from app.schemas.common import LocationCoordinates


class OrganizationBase(BaseModel):
    org_name: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Official registered name of the relief organization/shelter",
    )
    org_type: OrgType = Field(
        ...,
        description="Type of non-profit or relief organization",
    )
    tax_id: Optional[str] = Field(
        None,
        max_length=100,
        description="Government tax-exempt identifier or charity registration number",
    )
    address_text: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Physical street address of intake facility",
    )
    contact_phone: str = Field(
        ...,
        min_length=5,
        max_length=50,
        description="Primary operations contact phone number",
    )
    max_capacity_kg: Decimal = Field(
        ...,
        ge=0,
        description="Total maximum storage/intake capacity in kilograms",
    )
    accepted_categories: List[str] = Field(
        default_factory=list,
        description="List of food categories accepted (e.g. BAKERY, PREPARED_MEALS)",
    )
    can_pickup: bool = Field(
        default=True,
        description="Whether organization has staff/vehicles for self-pickup",
    )
    operating_hours: Optional[Dict[str, Any]] = Field(
        None,
        description="Structured intake hours per day (e.g. {'monday': {'open': '09:00', 'close': '18:00'}})",
    )

    @field_validator("accepted_categories")
    @classmethod
    def validate_categories(cls, v: List[str]) -> List[str]:
        if not v:
            return v
        valid_members = {c.value for c in FoodCategory}
        normalized = []
        seen = set()
        for cat in v:
            cat_upper = cat.strip().upper()
            if cat_upper not in valid_members:
                raise ValueError(
                    f"Invalid food category '{cat}'. Allowed: {sorted(list(valid_members))}"
                )
            if cat_upper not in seen:
                seen.add(cat_upper)
                normalized.append(cat_upper)
        return normalized


class OrganizationCreate(OrganizationBase):
    location: LocationCoordinates = Field(
        ...,
        description="Geographic facility location for proximity queries",
    )


class OrganizationUpdate(BaseModel):
    org_name: Optional[str] = Field(None, min_length=2, max_length=255)
    org_type: Optional[OrgType] = None
    tax_id: Optional[str] = Field(None, max_length=100)
    address_text: Optional[str] = Field(None, min_length=5, max_length=500)
    location: Optional[LocationCoordinates] = None
    contact_phone: Optional[str] = Field(None, min_length=5, max_length=50)
    max_capacity_kg: Optional[Decimal] = Field(None, ge=0)
    current_capacity_kg: Optional[Decimal] = Field(None, ge=0)
    accepted_categories: Optional[List[str]] = None
    can_pickup: Optional[bool] = None
    operating_hours: Optional[Dict[str, Any]] = None

    @field_validator("accepted_categories")
    @classmethod
    def validate_categories_update(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        valid_members = {c.value for c in FoodCategory}
        normalized = []
        seen = set()
        for cat in v:
            cat_upper = cat.strip().upper()
            if cat_upper not in valid_members:
                raise ValueError(
                    f"Invalid food category '{cat}'. Allowed: {sorted(list(valid_members))}"
                )
            if cat_upper not in seen:
                seen.add(cat_upper)
                normalized.append(cat_upper)
        return normalized


class OrganizationAdminVerificationUpdate(BaseModel):
    verification_status: OrgVerificationStatus = Field(
        ...,
        description="Admin-only approval/rejection/suspension of organization credentials",
    )


class OrganizationResponse(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    location: LocationCoordinates
    verification_status: OrgVerificationStatus
    current_capacity_kg: Decimal
    created_at: datetime
    updated_at: datetime
