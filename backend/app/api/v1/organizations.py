from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.core.database import get_async_db
from app.models.enums import MatchStatus, UserRole
from app.models.user import User
from app.schemas.match import MatchResponse
from app.schemas.organization import (
    OrganizationAdminVerificationUpdate,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.services.match_service import MatchService
from app.services.organization_service import OrganizationService

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.post(
    "/profile",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create relief organization intake profile for the authenticated recipient",
)
async def create_organization_profile(
    profile_data: OrganizationCreate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> OrganizationResponse:
    client_ip = request.client.host if request.client else None
    org = await OrganizationService.create_profile(
        db=db,
        user=current_user,
        profile_data=profile_data,
        ip_address=client_ip,
    )
    return OrganizationResponse.model_validate(org)


@router.get(
    "/profile",
    response_model=OrganizationResponse,
    summary="Retrieve the authenticated relief organization's own profile",
)
async def get_organization_profile(
    current_user: User = Depends(require_role(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> OrganizationResponse:
    org = await OrganizationService.get_profile_by_user_id(db=db, user_id=current_user.id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization profile not found. Please create your profile first.",
        )
    return OrganizationResponse.model_validate(org)


@router.patch(
    "/profile",
    response_model=OrganizationResponse,
    summary="Partially update the authenticated relief organization's own profile",
)
async def update_organization_profile(
    update_data: OrganizationUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> OrganizationResponse:
    client_ip = request.client.host if request.client else None
    org = await OrganizationService.update_profile(
        db=db,
        user=current_user,
        update_data=update_data,
        ip_address=client_ip,
    )
    return OrganizationResponse.model_validate(org)


@router.patch(
    "/{organization_id}/verification",
    response_model=OrganizationResponse,
    summary="Admin review endpoint to verify, reject, or suspend an organization",
)
async def admin_verify_organization(
    organization_id: UUID,
    verification_data: OrganizationAdminVerificationUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> OrganizationResponse:
    client_ip = request.client.host if request.client else None
    org = await OrganizationService.admin_update_verification(
        db=db,
        organization_id=organization_id,
        admin_user=current_user,
        verification_data=verification_data,
        ip_address=client_ip,
    )
    return OrganizationResponse.model_validate(org)


@router.get(
    "/matches",
    response_model=List[MatchResponse],
    summary="List all incoming match offers for the authenticated organization",
)
async def list_incoming_matches(
    status_filter: Optional[MatchStatus] = Query(None, alias="status", description="Optional match status filter"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(require_role(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_async_db),
) -> List[MatchResponse]:
    matches = await MatchService.list_matches_for_organization(
        db=db,
        user=current_user,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return [MatchResponse.model_validate(m) for m in matches]

