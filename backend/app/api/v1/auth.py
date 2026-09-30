from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_async_db
from app.models.user import User
from app.schemas.auth import (
    TokenRefreshRequest,
    TokenRefreshResponse,
    TokenResponse,
)
from app.schemas.user import (
    UserLoginRequest,
    UserPasswordChangeRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new food business, organization, or volunteer account",
)
async def register(
    register_data: UserRegisterRequest,
    db: AsyncSession = Depends(get_async_db),
) -> UserResponse:
    user = await AuthService.register_user(db=db, register_data=register_data)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate with email and password to receive JWT access and refresh tokens",
)
async def login(
    login_data: UserLoginRequest,
    db: AsyncSession = Depends(get_async_db),
) -> TokenResponse:
    user, access_token, refresh_token, expires_in = await AuthService.authenticate_user(
        db=db,
        login_data=login_data,
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=TokenRefreshResponse,
    summary="Renew an expired access token using a valid refresh token",
)
async def refresh_token(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_async_db),
) -> TokenRefreshResponse:
    new_access_token, expires_in = await AuthService.refresh_user_token(
        db=db,
        refresh_token_str=refresh_data.refresh_token,
    )
    return TokenRefreshResponse(
        access_token=new_access_token,
        token_type="bearer",
        expires_in=expires_in,
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Retrieve current authenticated user profile details",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    summary="Change account password",
)
async def change_password(
    password_data: UserPasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> dict:
    await AuthService.change_password(
        db=db,
        user=current_user,
        password_data=password_data,
    )
    return {"message": "Password changed successfully"}
