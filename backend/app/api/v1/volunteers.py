from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.core.database import get_async_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.volunteer import (
    VolunteerCreate,
    VolunteerResponse,
    VolunteerUpdate,
)
from app.services.volunteer_service import VolunteerService

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


@router.post(
    "/profile",
    response_model=VolunteerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create courier transport profile for the authenticated volunteer",
)
async def create_volunteer_profile(
    profile_data: VolunteerCreate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
    db: AsyncSession = Depends(get_async_db),
) -> VolunteerResponse:
    client_ip = request.client.host if request.client else None
    volunteer = await VolunteerService.create_profile(
        db=db,
        user=current_user,
        profile_data=profile_data,
        ip_address=client_ip,
    )
    return VolunteerResponse.model_validate(volunteer)


@router.get(
    "/profile",
    response_model=VolunteerResponse,
    summary="Retrieve the authenticated volunteer's own profile",
)
async def get_volunteer_profile(
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
    db: AsyncSession = Depends(get_async_db),
) -> VolunteerResponse:
    volunteer = await VolunteerService.get_profile_by_user_id(db=db, user_id=current_user.id)
    if not volunteer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Volunteer profile not found. Please create your profile first.",
        )
    return VolunteerResponse.model_validate(volunteer)


@router.patch(
    "/profile",
    response_model=VolunteerResponse,
    summary="Partially update the authenticated volunteer's own profile or availability",
)
async def update_volunteer_profile(
    update_data: VolunteerUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
    db: AsyncSession = Depends(get_async_db),
) -> VolunteerResponse:
    client_ip = request.client.host if request.client else None
    volunteer = await VolunteerService.update_profile(
        db=db,
        user=current_user,
        update_data=update_data,
        ip_address=client_ip,
    )
    return VolunteerResponse.model_validate(volunteer)
