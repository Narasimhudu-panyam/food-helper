from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.core.database import get_async_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.food_business import (
    FoodBusinessCreate,
    FoodBusinessResponse,
    FoodBusinessUpdate,
)
from app.services.business_service import BusinessService

router = APIRouter(prefix="/businesses", tags=["Food Businesses"])


@router.post(
    "/profile",
    response_model=FoodBusinessResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create food business profile for the authenticated donor kitchen",
)
async def create_business_profile(
    profile_data: FoodBusinessCreate,
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> FoodBusinessResponse:
    profile = await BusinessService.create_profile(
        db=db,
        user=current_user,
        profile_data=profile_data,
    )
    return FoodBusinessResponse.model_validate(profile)


@router.get(
    "/profile",
    response_model=FoodBusinessResponse,
    summary="Retrieve the authenticated donor kitchen's own profile",
)
async def get_business_profile(
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> FoodBusinessResponse:
    profile = await BusinessService.get_profile_by_user_id(db=db, user_id=current_user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food business profile not found. Please create your profile first.",
        )
    return FoodBusinessResponse.model_validate(profile)


@router.patch(
    "/profile",
    response_model=FoodBusinessResponse,
    summary="Partially update the authenticated donor kitchen's own profile",
)
async def update_business_profile(
    update_data: FoodBusinessUpdate,
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> FoodBusinessResponse:
    profile = await BusinessService.update_profile(
        db=db,
        user=current_user,
        update_data=update_data,
    )
    return FoodBusinessResponse.model_validate(profile)
