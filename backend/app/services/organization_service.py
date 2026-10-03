from decimal import Decimal
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.enums import NotificationType, OrgVerificationStatus
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import (
    AdminOrganizationResponse,
    OrganizationAdminVerificationUpdate,
    OrganizationCreate,
    OrganizationUpdate,
)
from app.services.notification_service import NotificationService


class OrganizationService:
    @staticmethod
    async def get_profile_by_user_id(
        db: AsyncSession,
        user_id: UUID,
    ) -> Optional[Organization]:
        """Query an organization profile by its owning user UUID."""
        stmt = select(Organization).where(Organization.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_profile_by_id(
        db: AsyncSession,
        organization_id: UUID,
    ) -> Optional[Organization]:
        """Query an organization profile by its primary UUID."""
        stmt = select(Organization).where(Organization.id == organization_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_profile(
        db: AsyncSession,
        user: User,
        profile_data: OrganizationCreate,
        ip_address: Optional[str] = None,
    ) -> Organization:
        """
        Create and persist an organization profile for an authenticated ORGANIZATION user.
        Rejects duplicate profile creation attempts with 409 Conflict.
        Records an audit log entry.
        """
        existing_profile = await OrganizationService.get_profile_by_user_id(db, user.id)
        if existing_profile:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An organization profile already exists for this account",
            )

        # Capacity sanity check
        if profile_data.max_capacity_kg < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum capacity cannot be negative",
            )

        # Convert API coordinates to PostGIS POINT(lon lat)
        location_elem = WKTElement(
            f"POINT({profile_data.location.longitude} {profile_data.location.latitude})",
            srid=4326,
        )

        new_org = Organization(
            user_id=user.id,
            org_name=profile_data.org_name,
            org_type=profile_data.org_type,
            tax_id=profile_data.tax_id,
            address_text=profile_data.address_text,
            location=location_elem,
            contact_phone=profile_data.contact_phone,
            verification_status=OrgVerificationStatus.PENDING,
            max_capacity_kg=profile_data.max_capacity_kg,
            current_capacity_kg=Decimal("0.0"),
            accepted_categories=profile_data.accepted_categories,
            can_pickup=profile_data.can_pickup,
            operating_hours=profile_data.operating_hours,
        )

        db.add(new_org)
        await db.flush()

        # Audit log creation
        audit = AuditLog(
            actor_id=user.id,
            action="ORGANIZATION_PROFILE_CREATED",
            entity_type="organization",
            entity_id=new_org.id,
            previous_state=None,
            new_state={
                "org_name": new_org.org_name,
                "org_type": new_org.org_type.value,
                "max_capacity_kg": float(new_org.max_capacity_kg),
                "verification_status": new_org.verification_status.value,
                "accepted_categories": list(new_org.accepted_categories),
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(new_org)

        return new_org

    @staticmethod
    async def update_profile(
        db: AsyncSession,
        user: User,
        update_data: OrganizationUpdate,
        ip_address: Optional[str] = None,
    ) -> Organization:
        """
        Partially update an existing organization profile owned by the authenticated user.
        Validates capacity invariant (0 <= current_capacity <= max_capacity).
        Records an audit log entry.
        """
        org = await OrganizationService.get_profile_by_user_id(db, user.id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization profile not found. Please create your profile first.",
            )

        prev_state = {
            "org_name": org.org_name,
            "max_capacity_kg": float(org.max_capacity_kg),
            "current_capacity_kg": float(org.current_capacity_kg),
            "accepted_categories": list(org.accepted_categories),
        }

        # Calculate target capacities after proposed update
        target_max = (
            update_data.max_capacity_kg
            if update_data.max_capacity_kg is not None
            else Decimal(str(org.max_capacity_kg))
        )
        target_current = (
            update_data.current_capacity_kg
            if update_data.current_capacity_kg is not None
            else Decimal(str(org.current_capacity_kg))
        )

        if target_max < 0 or target_current < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Capacity values cannot be negative",
            )

        if target_current > target_max:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Current capacity ({target_current} kg) cannot exceed maximum capacity ({target_max} kg)",
            )

        update_dict = update_data.model_dump(exclude_unset=True)

        for key, value in update_dict.items():
            if key == "location" and update_data.location is not None:
                org.location = WKTElement(
                    f"POINT({update_data.location.longitude} {update_data.location.latitude})",
                    srid=4326,
                )
            else:
                setattr(org, key, value)

        # Audit log entry
        audit = AuditLog(
            actor_id=user.id,
            action="ORGANIZATION_PROFILE_UPDATED",
            entity_type="organization",
            entity_id=org.id,
            previous_state=prev_state,
            new_state={
                "org_name": org.org_name,
                "max_capacity_kg": float(org.max_capacity_kg),
                "current_capacity_kg": float(org.current_capacity_kg),
                "accepted_categories": list(org.accepted_categories),
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(org)

        return org

    @staticmethod
    async def admin_update_verification(
        db: AsyncSession,
        organization_id: UUID,
        admin_user: User,
        verification_data: OrganizationAdminVerificationUpdate,
        ip_address: Optional[str] = None,
    ) -> Organization:
        """
        Admin-only review action updating an organization's verification status.
        Records an audit log entry.
        """
        org = await OrganizationService.get_profile_by_id(db, organization_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found",
            )

        prev_status = org.verification_status.value
        org.verification_status = verification_data.verification_status

        audit = AuditLog(
            actor_id=admin_user.id,
            action="ORGANIZATION_VERIFICATION_UPDATED",
            entity_type="organization",
            entity_id=org.id,
            previous_state={"verification_status": prev_status},
            new_state={"verification_status": verification_data.verification_status.value},
            ip_address=ip_address,
        )
        db.add(audit)

        # Notify organization user of verification update
        await NotificationService.create_notification(
            db=db,
            recipient_id=org.user_id,
            title="Organization Verification Status Updated",
            message=f"Your organization verification status has been updated to '{verification_data.verification_status.value}'.",
            notification_type=NotificationType.VERIFICATION_STATUS_CHANGED,
            related_entity_type="organization",
            related_entity_id=org.id,
        )

        await db.commit()
        await db.refresh(org)

        return org

    @staticmethod
    async def list_admin_organizations(
        db: AsyncSession,
        verification_status: Optional[OrgVerificationStatus] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AdminOrganizationResponse]:
        """Query and return organizations for administrator review with owner metadata."""
        stmt = (
            select(Organization)
            .options(joinedload(Organization.user))
            .order_by(Organization.created_at.desc())
        )
        if verification_status:
            stmt = stmt.where(Organization.verification_status == verification_status)
        if search:
            search_term = f"%{search.strip().lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(Organization.org_name).like(search_term),
                    func.lower(Organization.address_text).like(search_term),
                    func.lower(Organization.tax_id).like(search_term),
                )
            )
        stmt = stmt.limit(limit).offset(offset)
        result = await db.execute(stmt)
        orgs = result.scalars().all()

        responses = []
        for org in orgs:
            resp = AdminOrganizationResponse.model_validate(org)
            if org.user:
                resp.owner_email = org.user.email
                resp.is_active = org.user.is_active
            responses.append(resp)
        return responses

    @staticmethod
    async def get_admin_organization_by_id(
        db: AsyncSession,
        organization_id: UUID,
    ) -> Optional[AdminOrganizationResponse]:
        """Query a single organization profile with owner metadata for administrator inspection."""
        stmt = (
            select(Organization)
            .options(joinedload(Organization.user))
            .where(Organization.id == organization_id)
        )
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()
        if not org:
            return None
        resp = AdminOrganizationResponse.model_validate(org)
        if org.user:
            resp.owner_email = org.user.email
            resp.is_active = org.user.is_active
        return resp

    @staticmethod
    async def verify_organization(
        db: AsyncSession,
        organization_id: UUID,
        admin_user: User,
        ip_address: Optional[str] = None,
    ) -> AdminOrganizationResponse:
        """
        Verify an organization, making it eligible for algorithmic match offers.
        Idempotent; records audit log and emits user notification.
        """
        stmt = (
            select(Organization)
            .options(joinedload(Organization.user))
            .where(Organization.id == organization_id)
        )
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found",
            )

        if org.verification_status == OrgVerificationStatus.VERIFIED:
            resp = AdminOrganizationResponse.model_validate(org)
            if org.user:
                resp.owner_email = org.user.email
                resp.is_active = org.user.is_active
            return resp

        prev_status = org.verification_status.value
        org.verification_status = OrgVerificationStatus.VERIFIED

        audit = AuditLog(
            actor_id=admin_user.id,
            action="ORGANIZATION_VERIFIED",
            entity_type="organization",
            entity_id=org.id,
            previous_state={"verification_status": prev_status},
            new_state={"verification_status": OrgVerificationStatus.VERIFIED.value},
            ip_address=ip_address,
        )
        db.add(audit)

        await NotificationService.create_notification(
            db=db,
            recipient_id=org.user_id,
            title="Organization Account Verified",
            message=f"Your relief organization '{org.org_name}' has been verified by an administrator. You can now receive donation match offers.",
            notification_type=NotificationType.VERIFICATION_STATUS_CHANGED,
            related_entity_type="organization",
            related_entity_id=org.id,
        )

        await db.commit()
        await db.refresh(org)

        resp = AdminOrganizationResponse.model_validate(org)
        if org.user:
            resp.owner_email = org.user.email
            resp.is_active = org.user.is_active
        return resp

    @staticmethod
    async def reject_organization(
        db: AsyncSession,
        organization_id: UUID,
        admin_user: User,
        reason: str,
        ip_address: Optional[str] = None,
    ) -> AdminOrganizationResponse:
        """
        Reject an organization verification application with an audited reason.
        Records audit log and emits user notification with the rejection context.
        """
        stmt = (
            select(Organization)
            .options(joinedload(Organization.user))
            .where(Organization.id == organization_id)
        )
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found",
            )

        prev_status = org.verification_status.value
        org.verification_status = OrgVerificationStatus.REJECTED

        audit = AuditLog(
            actor_id=admin_user.id,
            action="ORGANIZATION_REJECTED",
            entity_type="organization",
            entity_id=org.id,
            previous_state={"verification_status": prev_status},
            new_state={
                "verification_status": OrgVerificationStatus.REJECTED.value,
                "reason": reason,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await NotificationService.create_notification(
            db=db,
            recipient_id=org.user_id,
            title="Organization Verification Application Rejected",
            message=f"Your organization '{org.org_name}' verification application was rejected. Reason: {reason}",
            notification_type=NotificationType.VERIFICATION_STATUS_CHANGED,
            related_entity_type="organization",
            related_entity_id=org.id,
        )

        await db.commit()
        await db.refresh(org)

        resp = AdminOrganizationResponse.model_validate(org)
        if org.user:
            resp.owner_email = org.user.email
            resp.is_active = org.user.is_active
        return resp

