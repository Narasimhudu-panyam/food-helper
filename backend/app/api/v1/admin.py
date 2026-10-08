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
from app.schemas.user import (
    AdminUserDetailResponse,
    AdminUserResponse,
)
from app.services.organization_service import OrganizationService
from app.services.user_service import UserService

router = APIRouter(prefix="/admin", tags=["Admin"])


# =========================================================================
# Organization Management Endpoints
# =========================================================================

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


# =========================================================================
# User Management Endpoints
# =========================================================================

@router.get(
    "/users",
    response_model=List[AdminUserResponse],
    summary="List registered platform users with administrative status and profile context",
)
async def list_admin_users(
    search: Optional[str] = Query(
        None,
        description="Search query matching user email address",
    ),
    role: Optional[UserRole] = Query(
        None,
        description="Filter by user system role",
    ),
    is_active: Optional[bool] = Query(
        None,
        description="Filter by account active status",
    ),
    is_verified: Optional[bool] = Query(
        None,
        description="Filter by account email/domain verification status",
    ),
    limit: int = Query(50, ge=1, le=100, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> List[AdminUserResponse]:
    return await UserService.list_admin_users(
        db=db,
        search=search,
        role=role,
        is_active=is_active,
        is_verified=is_verified,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/users/{user_id}",
    response_model=AdminUserDetailResponse,
    summary="Retrieve complete user profile details and associated domain summary",
)
async def get_admin_user(
    user_id: UUID,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUserDetailResponse:
    user = await UserService.get_admin_user_by_id(
        db=db,
        user_id=user_id,
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found",
        )
    return user


@router.post(
    "/users/{user_id}/activate",
    response_model=AdminUserDetailResponse,
    summary="Activate a platform user account",
)
async def activate_admin_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUserDetailResponse:
    client_ip = request.client.host if request.client else None
    return await UserService.activate_user(
        db=db,
        user_id=user_id,
        admin_user=current_user,
        ip_address=client_ip,
    )


@router.post(
    "/users/{user_id}/deactivate",
    response_model=AdminUserDetailResponse,
    summary="Deactivate a platform user account (with admin self-deactivation protection)",
)
async def deactivate_admin_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_async_db),
) -> AdminUserDetailResponse:
    client_ip = request.client.host if request.client else None
    return await UserService.deactivate_user(
        db=db,
        user_id=user_id,
        admin_user=current_user,
        ip_address=client_ip,
    )

