from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_role, require_roles
from app.core.database import get_async_db
from app.models.enums import DonationStatus, UserRole
from app.models.user import User
from app.schemas.donation import (
    DonationCancelRequest,
    DonationCreate,
    DonationResponse,
    DonationUpdate,
)
from app.schemas.match import DonationMatchListResponse, MatchOfferCreate, MatchResponse
from app.services.business_service import BusinessService
from app.services.donation_service import DonationService
from app.services.match_service import MatchService
from app.services.matching_service import MatchingService

router = APIRouter(prefix="/donations", tags=["Donations"])


@router.post(
    "",
    response_model=DonationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new surplus food donation listing",
)
async def create_donation(
    donation_data: DonationCreate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> DonationResponse:
    client_ip = request.client.host if request.client else None
    donation = await DonationService.create_donation(
        db=db,
        user=current_user,
        data=donation_data,
        ip_address=client_ip,
    )
    return DonationResponse.model_validate(donation)


@router.get(
    "",
    response_model=List[DonationResponse],
    summary="List all donations belonging to the authenticated food business",
)
async def list_donations(
    status_filter: Optional[DonationStatus] = Query(None, alias="status", description="Optional lifecycle status filter"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> List[DonationResponse]:
    business = await BusinessService.get_profile_by_user_id(db, current_user.id)
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food business profile not found.",
        )

    donations = await DonationService.list_donations_for_business(
        db=db,
        business_id=business.id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return [DonationResponse.model_validate(d) for d in donations]


@router.get(
    "/{donation_id}",
    response_model=DonationResponse,
    summary="Retrieve a specific donation by ID with ownership enforcement",
)
async def get_donation(
    donation_id: UUID,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> DonationResponse:
    donation = await DonationService.get_donation_by_id(db, donation_id)
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found.",
        )

    if current_user.role == UserRole.FOOD_BUSINESS:
        business = await BusinessService.get_profile_by_user_id(db, current_user.id)
        if not business or donation.business_id != business.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this donation.",
            )

    return DonationResponse.model_validate(donation)


@router.patch(
    "/{donation_id}",
    response_model=DonationResponse,
    summary="Update an existing active donation listing",
)
async def update_donation(
    donation_id: UUID,
    update_data: DonationUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> DonationResponse:
    client_ip = request.client.host if request.client else None
    donation = await DonationService.update_donation(
        db=db,
        user=current_user,
        donation_id=donation_id,
        update_data=update_data,
        ip_address=client_ip,
    )
    return DonationResponse.model_validate(donation)


@router.post(
    "/{donation_id}/cancel",
    response_model=DonationResponse,
    summary="Cancel an active donation listing with a stated reason",
)
async def cancel_donation(
    donation_id: UUID,
    cancel_data: DonationCancelRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> DonationResponse:
    client_ip = request.client.host if request.client else None
    donation = await DonationService.cancel_donation(
        db=db,
        user=current_user,
        donation_id=donation_id,
        cancel_data=cancel_data,
        ip_address=client_ip,
    )
    return DonationResponse.model_validate(donation)


@router.get(
    "/{donation_id}/matches",
    response_model=DonationMatchListResponse,
    summary="Discover and rank verified candidate organizations for a surplus food donation",
)
async def get_donation_matches(
    donation_id: UUID,
    max_radius_km: float = Query(25.0, ge=1.0, le=100.0, description="Spatial search radius in kilometers"),
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> DonationMatchListResponse:
    return await MatchingService.find_matches_for_donation(
        db=db,
        user=current_user,
        donation_id=donation_id,
        max_radius_km=max_radius_km,
    )


@router.post(
    "/{donation_id}/matches",
    response_model=MatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and send a match offer to a selected organization",
)
async def create_match_offer(
    donation_id: UUID,
    offer_data: MatchOfferCreate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.FOOD_BUSINESS)),
    db: AsyncSession = Depends(get_async_db),
) -> MatchResponse:
    client_ip = request.client.host if request.client else None
    match = await MatchService.create_match_offer(
        db=db,
        user=current_user,
        donation_id=donation_id,
        offer_data=offer_data,
        ip_address=client_ip,
    )
    return MatchResponse.model_validate(match)


@router.get(
    "/{donation_id}/offers",
    response_model=List[MatchResponse],
    summary="List all match offers created for this donation",
)
async def list_donation_match_offers(
    donation_id: UUID,
    current_user: User = Depends(require_roles(UserRole.FOOD_BUSINESS, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> List[MatchResponse]:
    matches = await MatchService.list_matches_for_donation(
        db=db,
        user=current_user,
        donation_id=donation_id,
    )
    return [MatchResponse.model_validate(m) for m in matches]

