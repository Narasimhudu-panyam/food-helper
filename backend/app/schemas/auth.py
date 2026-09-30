from pydantic import BaseModel, Field
from app.schemas.user import UserResponse


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT Bearer access token for API requests")
    refresh_token: str = Field(..., description="Long-lived JWT refresh token for renewing access")
    token_type: str = Field(default="bearer", description="Token authentication scheme")
    expires_in: int = Field(..., description="Access token lifespan in seconds")
    user: UserResponse = Field(..., description="Authenticated user profile details")


class TokenRefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Valid JWT refresh token")


class TokenRefreshResponse(BaseModel):
    access_token: str = Field(..., description="New JWT Bearer access token")
    token_type: str = Field(default="bearer")
    expires_in: int = Field(..., description="Access token lifespan in seconds")
