from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_role, require_roles
from app.core.database import get_async_db
from app.models.enums import MatchStatus, UserRole
from app.models.user import User
from app.schemas.match import MatchAcceptRequest, MatchDeclineRequest, MatchResponse
from app.schemas.pickup import PickupCreateRequest, PickupResponse
from app.services.match_service import MatchService
from app.services.pickup_service import PickupService

router = APIRouter(prefix="/matches", tags=["Matches"])


@router.get(
    "/{match_id}",
    response_model=MatchResponse,
    summary="Retrieve match offer details with multi-tenant ownership enforcement",
)
async def get_match_details(
    match_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> MatchResponse:
    match = await MatchService.get_match_by_id(
        db=db,
        user=current_user,
        match_id=match_id,
    )
    return MatchResponse.model_validate(match)


@router.post(
    "/{match_id}/accept",
    response_model=MatchResponse,
    summary="Atomically accept a match offer and reserve organization capacity",
)
async def accept_match(
    match_id: UUID,
    accept_data: MatchAcceptRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> MatchResponse:
    client_ip = request.client.host if request.client else None
    match = await MatchService.accept_match(
        db=db,
        user=current_user,
        match_id=match_id,
        accept_data=accept_data,
        ip_address=client_ip,
    )
    return MatchResponse.model_validate(match)


@router.post(
    "/{match_id}/decline",
    response_model=MatchResponse,
    summary="Decline a match offer with a stated rejection reason",
)
async def decline_match(
    match_id: UUID,
    decline_data: MatchDeclineRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> MatchResponse:
    match = await MatchService.decline_match(
        db=db,
        user=current_user,
        match_id=match_id,
        decline_data=decline_data,
        ip_address=client_ip,
    )
    return MatchResponse.model_validate(match)


@router.post(
    "/{match_id}/pickup",
    response_model=PickupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a pickup coordination task for an accepted match",
)
async def create_pickup_for_match(
    match_id: UUID,
    create_data: PickupCreateRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    pickup = await PickupService.create_pickup_for_match(
        db=db,
        user=current_user,
        match_id=match_id,
        create_data=create_data,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)

