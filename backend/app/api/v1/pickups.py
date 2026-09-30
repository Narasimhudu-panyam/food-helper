from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_role, require_roles
from app.core.database import get_async_db
from app.models.enums import PickupStatus, UserRole
from app.models.user import User
from app.schemas.pickup import (
    CandidateVolunteerMatchResponse,
    PickupAssignVolunteerRequest,
    PickupCancelRequest,
    PickupFailRequest,
    PickupResponse,
    PickupVerifyDeliveryRequest,
    PickupVolunteerMatchListResponse,
)
from app.services.pickup_service import PickupService
from app.services.volunteer_dispatch_service import VolunteerDispatchService

router = APIRouter(prefix="/pickups", tags=["Pickups"])


@router.get(
    "",
    response_model=List[PickupResponse],
    summary="List pickups belonging exclusively to the authenticated user's scope",
)
async def list_pickups(
    status_filter: Optional[PickupStatus] = Query(None, alias="status", description="Optional pickup status filter"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> List[PickupResponse]:
    pickups = await PickupService.list_pickups_for_user(
        db=db,
        user=current_user,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return [PickupResponse.model_validate(p) for p in pickups]


@router.get(
    "/{pickup_id}",
    response_model=PickupResponse,
    summary="Retrieve details for a specific pickup with ownership enforcement",
)
async def get_pickup(
    pickup_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    pickup = await PickupService.get_pickup_by_id(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
    )
    return PickupResponse.model_validate(pickup)


@router.post(
    "/{pickup_id}/start",
    response_model=PickupResponse,
    summary="Transition pickup to IN_TRANSIT",
)
async def start_pickup(
    pickup_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION, UserRole.VOLUNTEER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    pickup = await PickupService.start_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)


@router.post(
    "/{pickup_id}/complete",
    response_model=PickupResponse,
    summary="Atomically confirm delivery receipt and transition donation to DELIVERED",
)
async def complete_pickup(
    pickup_id: UUID,
    request: Request,
    verify_data: Optional[PickupVerifyDeliveryRequest] = None,
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    pickup = await PickupService.complete_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
        verify_data=verify_data,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)


@router.post(
    "/{pickup_id}/cancel",
    response_model=PickupResponse,
    summary="Cancel active pickup, release reserved organization capacity, and restore donation status",
)
async def cancel_pickup(
    pickup_id: UUID,
    cancel_data: PickupCancelRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ORGANIZATION, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    pickup = await PickupService.cancel_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
        cancel_data=cancel_data,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)


@router.post(
    "/{pickup_id}/fail",
    response_model=PickupResponse,
    summary="Record failed delivery attempt and release reserved organization capacity",
)
async def fail_pickup(
    pickup_id: UUID,
    fail_data: PickupFailRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION, UserRole.VOLUNTEER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    pickup = await PickupService.fail_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
        fail_data=fail_data,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)


@router.get(
    "/{pickup_id}/volunteers",
    response_model=PickupVolunteerMatchListResponse,
    summary="Find eligible volunteer couriers for a pickup requiring volunteer transport",
)
async def get_eligible_volunteers(
    pickup_id: UUID,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ORGANIZATION, UserRole.VOLUNTEER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupVolunteerMatchListResponse:
    return await VolunteerDispatchService.find_eligible_volunteers_for_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
    )


@router.post(
    "/{pickup_id}/assign",
    response_model=PickupResponse,
    summary="Assign or claim a volunteer courier for a pickup",
)
async def assign_volunteer(
    pickup_id: UUID,
    request: Request,
    assign_data: Optional[PickupAssignVolunteerRequest] = None,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ORGANIZATION, UserRole.VOLUNTEER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    vol_id = assign_data.volunteer_id if assign_data else None
    pickup = await VolunteerDispatchService.assign_volunteer_to_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
        volunteer_id=vol_id,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)


@router.post(
    "/{pickup_id}/release",
    response_model=PickupResponse,
    summary="Release or unclaim an assigned volunteer courier from a pickup",
)
async def release_volunteer(
    pickup_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ORGANIZATION, UserRole.VOLUNTEER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> PickupResponse:
    client_ip = request.client.host if request.client else None
    pickup = await VolunteerDispatchService.release_volunteer_from_pickup(
        db=db,
        user=current_user,
        pickup_id=pickup_id,
        ip_address=client_ip,
    )
    return PickupResponse.model_validate(pickup)

