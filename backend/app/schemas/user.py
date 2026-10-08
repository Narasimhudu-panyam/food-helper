from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import UserRole


class UserRegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="Unique email address for authentication")
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password must be at least 8 characters long",
    )
    role: UserRole = Field(..., description="Role assigned at registration")

    @field_validator("role")
    @classmethod
    def prevent_admin_self_registration(cls, v: UserRole) -> UserRole:
        if v == UserRole.ADMIN:
            raise ValueError("Direct self-registration as ADMIN is not permitted")
        return v


class UserLoginRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., description="Account password")


class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = Field(None, description="Updated email address")
    is_active: Optional[bool] = Field(None, description="Active status toggle")


class UserPasswordChangeRequest(BaseModel):
    current_password: str = Field(..., description="Current account password")
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password must be at least 8 characters long",
    )


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: UserRole
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime


class BusinessProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_name: str
    business_type: str
    address_text: str
    contact_phone: str


class OrganizationProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_name: str
    org_type: str
    verification_status: str
    address_text: str
    contact_phone: str
    max_capacity_kg: float


class VolunteerProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    vehicle_type: str
    contact_phone: str
    is_available: bool


class AdminUserResponse(UserResponse):
    profile_name: Optional[str] = Field(None, description="Name of the associated business, organization, or volunteer")
    display_name: Optional[str] = Field(None, description="Alias for profile_name or human-friendly name")


class AdminUserDetailResponse(UserResponse):
    business_profile: Optional[BusinessProfileSummary] = None
    organization_profile: Optional[OrganizationProfileSummary] = None
    volunteer_profile: Optional[VolunteerProfileSummary] = None

