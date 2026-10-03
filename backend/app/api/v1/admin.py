from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_role
from app.core.database import get_async_db
from app.models.enums import OrgVerificationStatus, UserRole
from app.models.user import User
from app.schemas.organization import (
    AdminOrganizationResponse,
    OrganizationRejectRequest,
)
from app.services.organization_service import OrganizationService

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get(
    "/organizations",
    response_model=List[AdminOrganizationResponse],
    summary="List registered relief organizations with administrative details and verification status",
)
async def list_admin_organizations(
    status_filter: Optional[OrgVerificationStatus] = Query(
        None,
        alias="verification_status",
        description="Filter by organization verification status",
    ),
    search: Optional[str] = Query(
        None,
        description="Search query matching organization name, address, or tax ID",
    ),
    limit: int = Query(50, ge=1, le=100, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> List[AdminOrganizationResponse]:
    return await OrganizationService.list_admin_organizations(
        db=db,
        verification_status=status_filter,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/organizations/{organization_id}",
    response_model=AdminOrganizationResponse,
    summary="Retrieve complete administrative details for a specific relief organization",
)
async def get_admin_organization(
    organization_id: UUID,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> AdminOrganizationResponse:
    org = await OrganizationService.get_admin_organization_by_id(
        db=db,
        organization_id=organization_id,
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization with ID '{organization_id}' not found",
        )
    return org


@router.post(
    "/organizations/{organization_id}/verify",
    response_model=AdminOrganizationResponse,
    summary="Verify an organization, making it eligible for automated donation matching",
)
async def verify_admin_organization(
    organization_id: UUID,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> AdminOrganizationResponse:
    client_ip = request.client.host if request.client else None
    return await OrganizationService.verify_organization(
        db=db,
        organization_id=organization_id,
        admin_user=current_user,
        ip_address=client_ip,
    )


@router.post(
    "/organizations/{organization_id}/reject",
    response_model=AdminOrganizationResponse,
    summary="Reject an organization verification application with an audited reason",
)
async def reject_admin_organization(
    organization_id: UUID,
    reject_data: OrganizationRejectRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> AdminOrganizationResponse:
    client_ip = request.client.host if request.client else None
    return await OrganizationService.reject_organization(
        db=db,
        organization_id=organization_id,
        admin_user=current_user,
        reason=reject_data.reason,
        ip_address=client_ip,
    )
