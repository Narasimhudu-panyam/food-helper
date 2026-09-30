from decimal import Decimal
from typing import Optional
from uuid import UUID
from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.enums import NotificationType, OrgVerificationStatus
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import (
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
