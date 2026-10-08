from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import (
    AdminUserDetailResponse,
    AdminUserResponse,
    BusinessProfileSummary,
    OrganizationProfileSummary,
    VolunteerProfileSummary,
)


class UserService:
    """
    Administrative service for platform user discovery, profile inspection,
    and secure account activation / deactivation.
    """

    @staticmethod
    def _build_user_detail_response(user: User) -> AdminUserDetailResponse:
        resp = AdminUserDetailResponse.model_validate(user)
        if user.food_business:
            resp.business_profile = BusinessProfileSummary(
                id=user.food_business.id,
                business_name=user.food_business.business_name,
                business_type=user.food_business.business_type.value,
                address_text=user.food_business.address_text,
                contact_phone=user.food_business.contact_phone,
            )
        if user.organization:
            resp.organization_profile = OrganizationProfileSummary(
                id=user.organization.id,
                org_name=user.organization.org_name,
                org_type=user.organization.org_type.value,
                verification_status=user.organization.verification_status.value,
                address_text=user.organization.address_text,
                contact_phone=user.organization.contact_phone,
                max_capacity_kg=float(user.organization.max_capacity_kg),
            )
        if user.volunteer:
            resp.volunteer_profile = VolunteerProfileSummary(
                id=user.volunteer.id,
                full_name=user.volunteer.full_name,
                vehicle_type=user.volunteer.vehicle_type.value,
                contact_phone=user.volunteer.contact_phone,
                is_available=user.volunteer.is_available,
            )
        return resp

    @staticmethod
    async def list_admin_users(
        db: AsyncSession,
        search: Optional[str] = None,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        is_verified: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AdminUserResponse]:
        """Query and return platform users for administrative overview."""
        stmt = (
            select(User)
            .options(
                joinedload(User.food_business),
                joinedload(User.organization),
                joinedload(User.volunteer),
            )
            .order_by(User.created_at.desc())
        )

        if role:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if is_verified is not None:
            stmt = stmt.where(User.is_verified == is_verified)
        if search:
            search_term = f"%{search.strip().lower()}%"
            stmt = stmt.where(func.lower(User.email).like(search_term))

        stmt = stmt.limit(limit).offset(offset)
        result = await db.execute(stmt)
        users = result.scalars().unique().all()

        responses = []
        for u in users:
            resp = AdminUserResponse.model_validate(u)
            name = None
            if u.food_business:
                name = u.food_business.business_name
            elif u.organization:
                name = u.organization.org_name
            elif u.volunteer:
                name = u.volunteer.full_name
            resp.profile_name = name
            resp.display_name = name
            responses.append(resp)

        return responses


    @staticmethod
    async def get_admin_user_by_id(
        db: AsyncSession,
        user_id: UUID,
    ) -> Optional[AdminUserDetailResponse]:
        """Query single user profile with attached domain summaries."""
        stmt = (
            select(User)
            .options(
                joinedload(User.food_business),
                joinedload(User.organization),
                joinedload(User.volunteer),
            )
            .where(User.id == user_id)
        )
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return None
        return UserService._build_user_detail_response(user)

    @staticmethod
    async def activate_user(
        db: AsyncSession,
        user_id: UUID,
        admin_user: User,
        ip_address: Optional[str] = None,
    ) -> AdminUserDetailResponse:
        """
        Activate a platform user account.
        Idempotent; records audit log entry.
        """
        stmt = (
            select(User)
            .options(
                joinedload(User.food_business),
                joinedload(User.organization),
                joinedload(User.volunteer),
            )
            .where(User.id == user_id)
        )
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID '{user_id}' not found",
            )

        if user.is_active:
            return UserService._build_user_detail_response(user)

        user.is_active = True

        audit = AuditLog(
            actor_id=admin_user.id,
            action="USER_ACTIVATED",
            entity_type="user",
            entity_id=user.id,
            previous_state={"is_active": False},
            new_state={"is_active": True},
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(user)

        return UserService._build_user_detail_response(user)

    @staticmethod
    async def deactivate_user(
        db: AsyncSession,
        user_id: UUID,
        admin_user: User,
        ip_address: Optional[str] = None,
    ) -> AdminUserDetailResponse:
        """
        Deactivate a platform user account.
        Enforces self-protection preventing admins from deactivating themselves.
        Idempotent; records audit log entry.
        """
        if user_id == admin_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Administrators cannot deactivate their own account",
            )

        stmt = (
            select(User)
            .options(
                joinedload(User.food_business),
                joinedload(User.organization),
                joinedload(User.volunteer),
            )
            .where(User.id == user_id)
        )
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID '{user_id}' not found",
            )

        if not user.is_active:
            return UserService._build_user_detail_response(user)

        user.is_active = False

        audit = AuditLog(
            actor_id=admin_user.id,
            action="USER_DEACTIVATED",
            entity_type="user",
            entity_id=user.id,
            previous_state={"is_active": True},
            new_state={"is_active": False},
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(user)

        return UserService._build_user_detail_response(user)
