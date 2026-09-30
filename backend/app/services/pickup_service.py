from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    DonationStatus,
    MatchStatus,
    NotificationType,
    PickupStatus,
    TransportMode,
    UserRole,
)
from app.models.match import DonationMatch
from app.models.organization import Organization
from app.models.pickup import Pickup
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.pickup import (
    PickupCancelRequest,
    PickupCreateRequest,
    PickupFailRequest,
    PickupVerifyDeliveryRequest,
)
from app.services.business_service import BusinessService
from app.services.donation_service import DonationService
from app.services.match_service import MatchService
from app.services.notification_service import NotificationService
from app.services.organization_service import OrganizationService
from app.services.volunteer_service import VolunteerService


class PickupService:
    @staticmethod
    async def create_pickup_for_match(
        db: AsyncSession,
        user: User,
        match_id: UUID,
        create_data: PickupCreateRequest,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Create a physical pickup record for a successfully accepted donation match.
        Authorized for either the donor kitchen (FOOD_BUSINESS) or the recipient (ORGANIZATION).
        """
        match = await MatchService.get_match_by_id(db, user, match_id)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found.",
            )

        if match.status != MatchStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot create pickup for match in status '{match.status.value}'. Match must be ACCEPTED.",
            )

        donation = await DonationService.get_donation_by_id(db, match.donation_id)
        if not donation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated donation not found.",
            )

        if donation.status != DonationStatus.MATCHED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot create pickup for donation in status '{donation.status.value}'. Donation must be MATCHED.",
            )

        # Check for existing pickup record for this donation
        stmt_existing = select(Pickup).where(Pickup.donation_id == donation.id)
        res_existing = await db.execute(stmt_existing)
        existing_pickup = res_existing.scalar_one_or_none()
        if existing_pickup:
            if existing_pickup.status != PickupStatus.CANCELLED:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An active pickup record already exists for this matched donation.",
                )

        now = datetime.now(timezone.utc)
        deadline = donation.pickup_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        if deadline <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Donation pickup deadline has already expired.",
            )

        # Time window validation
        if create_data.scheduled_pickup_time:
            sched_time = create_data.scheduled_pickup_time
            if sched_time.tzinfo is None:
                sched_time = sched_time.replace(tzinfo=timezone.utc)

            avail_from = donation.available_from
            if avail_from.tzinfo is None:
                avail_from = avail_from.replace(tzinfo=timezone.utc)

            if sched_time < avail_from:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scheduled pickup time cannot be earlier than donation available_from time.",
                )
            if sched_time > deadline:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scheduled pickup time cannot be later than donation pickup_deadline.",
                )

        new_pickup = Pickup(
            id=uuid4(),
            donation_id=donation.id,
            organization_id=match.organization_id,
            volunteer_id=None,
            transport_mode=create_data.transport_mode or TransportMode.ORG_DIRECT,
            status=PickupStatus.ASSIGNED,
            scheduled_pickup_time=create_data.scheduled_pickup_time,
            notes=create_data.notes,
            created_at=now,
            updated_at=now,
        )

        db.add(new_pickup)
        await db.flush()

        audit = AuditLog(
            actor_id=user.id,
            action="PICKUP_CREATED",
            entity_type="pickup",
            entity_id=new_pickup.id,
            previous_state=None,
            new_state={
                "donation_id": str(donation.id),
                "organization_id": str(match.organization_id),
                "transport_mode": new_pickup.transport_mode.value,
                "status": new_pickup.status.value,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        # Notify the counterpart participant (donor if org created, org if donor created)
        org = await OrganizationService.get_profile_by_id(db, match.organization_id)
        business = await BusinessService.get_profile_by_id(db, donation.business_id)
        if user.role == UserRole.ORGANIZATION and business:
            await NotificationService.create_notification(
                db=db,
                recipient_id=business.user_id,
                title="Pickup Scheduled",
                message=f"A physical pickup has been scheduled for donation '{donation.title}'.",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=new_pickup.id,
            )
        elif user.role == UserRole.FOOD_BUSINESS and org:
            await NotificationService.create_notification(
                db=db,
                recipient_id=org.user_id,
                title="Pickup Scheduled",
                message=f"Donor kitchen scheduled pickup for donation '{donation.title}'.",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=new_pickup.id,
            )

        await db.commit()
        await db.refresh(new_pickup)

        return new_pickup

    @staticmethod
    async def get_pickup_by_id(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
    ) -> Pickup:
        """
        Retrieve pickup details with multi-tenant ownership enforcement
        (donor kitchen, recipient organization, assigned volunteer, or admin).
        """
        stmt = select(Pickup).where(Pickup.id == pickup_id)
        result = await db.execute(stmt)
        pickup = result.scalar_one_or_none()
        if not pickup:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pickup not found.",
            )

        if user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or pickup.organization_id != org.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view this pickup.",
                )
        elif user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
            if not business or not donation or donation.business_id != business.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view this pickup.",
                )
        elif user.role == UserRole.VOLUNTEER:
            volunteer = await VolunteerService.get_profile_by_user_id(db, user.id)
            if not volunteer or pickup.volunteer_id != volunteer.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view this pickup.",
                )
        elif user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden.",
            )

        return pickup

    @staticmethod
    async def list_pickups_for_user(
        db: AsyncSession,
        user: User,
        status_filter: Optional[PickupStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Pickup]:
        """List role-scoped pickups belonging exclusively to the authenticated user."""
        stmt = select(Pickup).order_by(desc(Pickup.created_at)).offset(offset).limit(limit)

        if user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org:
                raise HTTPException(status_code=404, detail="Organization profile not found.")
            stmt = stmt.where(Pickup.organization_id == org.id)

        elif user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            if not business:
                raise HTTPException(status_code=404, detail="Food business profile not found.")
            stmt = stmt.join(Donation, Pickup.donation_id == Donation.id).where(Donation.business_id == business.id)

        elif user.role == UserRole.VOLUNTEER:
            vol = await VolunteerService.get_profile_by_user_id(db, user.id)
            if not vol:
                raise HTTPException(status_code=404, detail="Volunteer profile not found.")
            stmt = stmt.where(Pickup.volunteer_id == vol.id)

        if status_filter:
            stmt = stmt.where(Pickup.status == status_filter)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def start_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Transition pickup status to IN_TRANSIT.
        Authorized for the recipient organization (ORG_DIRECT), assigned volunteer, or admin.
        """
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id).with_for_update()
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(status_code=404, detail="Pickup not found.")

        # Authorization check
        if user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or pickup.organization_id != org.id:
                raise HTTPException(status_code=403, detail="You do not have permission to start this pickup.")
        elif user.role == UserRole.VOLUNTEER:
            vol = await VolunteerService.get_profile_by_user_id(db, user.id)
            if not vol or pickup.volunteer_id != vol.id:
                raise HTTPException(status_code=403, detail="You do not have permission to start this pickup.")
        elif user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access forbidden.")

        if pickup.status in (PickupStatus.DELIVERED, PickupStatus.CANCELLED, PickupStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start pickup in terminal status '{pickup.status.value}'.",
            )

        now = datetime.now(timezone.utc)
        prev_status = pickup.status.value
        pickup.status = PickupStatus.IN_TRANSIT
        if pickup.picked_up_at is None:
            pickup.picked_up_at = now

        db.add(AuditLog(
            actor_id=user.id,
            action="PICKUP_STARTED",
            entity_type="pickup",
            entity_id=pickup.id,
            previous_state={"status": prev_status},
            new_state={"status": PickupStatus.IN_TRANSIT.value, "picked_up_at": now.isoformat()},
            ip_address=ip_address,
        ))

        # Notify donor and recipient organization that pickup is in transit
        donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
        if donation:
            business = await BusinessService.get_profile_by_id(db, donation.business_id)
            if business:
                await NotificationService.create_notification(
                    db=db,
                    recipient_id=business.user_id,
                    title="Pickup In Transit",
                    message=f"Surplus food donation '{donation.title}' is now in transit.",
                    notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                    related_entity_type="pickup",
                    related_entity_id=pickup.id,
                )

        org = await OrganizationService.get_profile_by_id(db, pickup.organization_id)
        if org:
            await NotificationService.create_notification(
                db=db,
                recipient_id=org.user_id,
                title="Pickup In Transit",
                message=f"Food donation '{donation.title if donation else 'surplus food'}' is on the way to your facility.",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        await db.commit()
        await db.refresh(pickup)
        return pickup

    @staticmethod
    async def complete_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
        verify_data: Optional[PickupVerifyDeliveryRequest] = None,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Atomically mark pickup as DELIVERED and update the associated donation status to DELIVERED.
        Authorized for the recipient organization confirming physical delivery receipt (or admin).
        """
        # 1. Lock pickup row
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id).with_for_update()
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(status_code=404, detail="Pickup not found.")

        # Authorization: Recipient organization confirming delivery
        if user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or pickup.organization_id != org.id:
                raise HTTPException(status_code=403, detail="You do not have permission to complete this pickup.")
        elif user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Only the recipient organization or admin can complete a pickup.")

        if pickup.status == PickupStatus.DELIVERED:
            raise HTTPException(status_code=409, detail="Pickup is already completed.")
        if pickup.status in (PickupStatus.CANCELLED, PickupStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot complete pickup in status '{pickup.status.value}'.",
            )

        # 2. Lock donation row
        stmt_don = select(Donation).where(Donation.id == pickup.donation_id).with_for_update()
        res_don = await db.execute(stmt_don)
        donation = res_don.scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=404, detail="Associated donation not found.")

        now = datetime.now(timezone.utc)
        prev_status = pickup.status.value

        pickup.status = PickupStatus.DELIVERED
        pickup.delivered_at = now
        if pickup.picked_up_at is None:
            pickup.picked_up_at = now

        if verify_data and verify_data.notes:
            pickup.notes = f"{pickup.notes or ''}\nDelivery Note: {verify_data.notes}".strip()

        # Synchronize donation lifecycle state
        donation.status = DonationStatus.DELIVERED

        db.add(AuditLog(
            actor_id=user.id,
            action="PICKUP_COMPLETED",
            entity_type="pickup",
            entity_id=pickup.id,
            previous_state={"status": prev_status},
            new_state={"status": PickupStatus.DELIVERED.value, "delivered_at": now.isoformat()},
            ip_address=ip_address,
        ))

        db.add(AuditLog(
            actor_id=user.id,
            action="DONATION_DELIVERED",
            entity_type="donation",
            entity_id=donation.id,
            previous_state={"status": DonationStatus.MATCHED.value},
            new_state={"status": DonationStatus.DELIVERED.value},
            ip_address=ip_address,
        ))

        # Restore volunteer availability if assigned
        if pickup.volunteer_id:
            stmt_vol = select(Volunteer).where(Volunteer.id == pickup.volunteer_id).with_for_update()
            res_vol = await db.execute(stmt_vol)
            vol = res_vol.scalar_one_or_none()
            if vol:
                vol.is_available = True
                db.add(AuditLog(
                    actor_id=user.id,
                    action="VOLUNTEER_AVAILABILITY_CHANGED",
                    entity_type="volunteer",
                    entity_id=vol.id,
                    previous_state={"is_available": False},
                    new_state={"is_available": True, "reason": "pickup_delivered"},
                    ip_address=ip_address,
                ))
                # Notify volunteer of successful delivery
                await NotificationService.create_notification(
                    db=db,
                    recipient_id=vol.user_id,
                    title="Delivery Completed",
                    message=f"Delivery of '{donation.title}' was confirmed completed. Thank you!",
                    notification_type=NotificationType.DONATION_DELIVERED,
                    related_entity_type="pickup",
                    related_entity_id=pickup.id,
                )

        # Notify donor kitchen of completed delivery
        business = await BusinessService.get_profile_by_id(db, donation.business_id)
        if business:
            await NotificationService.create_notification(
                db=db,
                recipient_id=business.user_id,
                title="Donation Delivered Successfully",
                message=f"Your surplus food donation '{donation.title}' has been successfully delivered and confirmed.",
                notification_type=NotificationType.DONATION_DELIVERED,
                related_entity_type="donation",
                related_entity_id=donation.id,
            )

        await db.commit()
        await db.refresh(pickup)
        return pickup

    @staticmethod
    async def cancel_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
        cancel_data: PickupCancelRequest,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Cancel an active pickup, release reserved organization capacity,
        and safely restore donation status.
        Authorized for either the donor kitchen or the recipient organization.
        """
        # 1. Lock pickup row
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id).with_for_update()
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(status_code=404, detail="Pickup not found.")

        # 2. Lock donation row
        stmt_don = select(Donation).where(Donation.id == pickup.donation_id).with_for_update()
        res_don = await db.execute(stmt_don)
        donation = res_don.scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=404, detail="Associated donation not found.")

        # Authorization check
        if user.role == UserRole.ORGANIZATION:
            org_user_profile = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org_user_profile or pickup.organization_id != org_user_profile.id:
                raise HTTPException(status_code=403, detail="You do not have permission to cancel this pickup.")
        elif user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            if not business or donation.business_id != business.id:
                raise HTTPException(status_code=403, detail="You do not have permission to cancel this pickup.")
        elif user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access forbidden.")

        if pickup.status == PickupStatus.DELIVERED:
            raise HTTPException(status_code=400, detail="Cannot cancel an already completed delivery.")
        if pickup.status == PickupStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Pickup is already cancelled.")

        # 3. Lock organization row to release capacity
        stmt_org = select(Organization).where(Organization.id == pickup.organization_id).with_for_update()
        res_org = await db.execute(stmt_org)
        org = res_org.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")

        now = datetime.now(timezone.utc)
        prev_status = pickup.status.value

        # Release capacity
        prev_cap = float(org.current_capacity_kg)
        new_cap = max(0.0, prev_cap - float(donation.total_weight_kg))
        org.current_capacity_kg = new_cap

        pickup.status = PickupStatus.CANCELLED
        pickup.notes = f"{pickup.notes or ''}\nCancellation Reason: {cancel_data.cancellation_reason}".strip()

        # Reset donation to CREATED so donor can re-offer
        donation.status = DonationStatus.CREATED

        db.add(AuditLog(
            actor_id=user.id,
            action="PICKUP_CANCELLED",
            entity_type="pickup",
            entity_id=pickup.id,
            previous_state={"status": prev_status},
            new_state={
                "status": PickupStatus.CANCELLED.value,
                "cancellation_reason": cancel_data.cancellation_reason,
            },
            ip_address=ip_address,
        ))

        db.add(AuditLog(
            actor_id=user.id,
            action="CAPACITY_RELEASED",
            entity_type="organization",
            entity_id=org.id,
            previous_state={"current_capacity_kg": prev_cap},
            new_state={"current_capacity_kg": new_cap, "released_from_pickup_id": str(pickup.id)},
            ip_address=ip_address,
        ))

        # Restore volunteer availability if assigned
        if pickup.volunteer_id:
            stmt_vol = select(Volunteer).where(Volunteer.id == pickup.volunteer_id).with_for_update()
            res_vol = await db.execute(stmt_vol)
            vol = res_vol.scalar_one_or_none()
            if vol:
                vol.is_available = True
                db.add(AuditLog(
                    actor_id=user.id,
                    action="VOLUNTEER_AVAILABILITY_CHANGED",
                    entity_type="volunteer",
                    entity_id=vol.id,
                    previous_state={"is_available": False},
                    new_state={"is_available": True, "reason": "pickup_cancelled"},
                    ip_address=ip_address,
                ))
                await NotificationService.create_notification(
                    db=db,
                    recipient_id=vol.user_id,
                    title="Pickup Cancelled",
                    message=f"Pickup for '{donation.title}' was cancelled. Reason: {cancel_data.cancellation_reason}",
                    notification_type=NotificationType.DONATION_CANCELLED,
                    related_entity_type="pickup",
                    related_entity_id=pickup.id,
                )

        # Notify counterpart party (donor kitchen or recipient organization)
        business = await BusinessService.get_profile_by_id(db, donation.business_id)
        if user.role == UserRole.ORGANIZATION and business:
            await NotificationService.create_notification(
                db=db,
                recipient_id=business.user_id,
                title="Pickup Cancelled",
                message=f"Recipient organization cancelled pickup for '{donation.title}'. Reason: {cancel_data.cancellation_reason}",
                notification_type=NotificationType.DONATION_CANCELLED,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )
        elif user.role == UserRole.FOOD_BUSINESS and org:
            await NotificationService.create_notification(
                db=db,
                recipient_id=org.user_id,
                title="Pickup Cancelled",
                message=f"Donor cancelled pickup for '{donation.title}'. Reason: {cancel_data.cancellation_reason}",
                notification_type=NotificationType.DONATION_CANCELLED,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        await db.commit()
        await db.refresh(pickup)
        return pickup

    @staticmethod
    async def fail_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
        fail_data: PickupFailRequest,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Record a failed delivery attempt, release reserved organization capacity,
        and update donation state to FAILED_DELIVERY.
        """
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id).with_for_update()
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(status_code=404, detail="Pickup not found.")

        stmt_don = select(Donation).where(Donation.id == pickup.donation_id).with_for_update()
        res_don = await db.execute(stmt_don)
        donation = res_don.scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=404, detail="Associated donation not found.")

        stmt_org = select(Organization).where(Organization.id == pickup.organization_id).with_for_update()
        res_org = await db.execute(stmt_org)
        org = res_org.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")

        if pickup.status in (PickupStatus.DELIVERED, PickupStatus.CANCELLED, PickupStatus.FAILED):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot fail pickup in status '{pickup.status.value}'.",
            )

        prev_cap = float(org.current_capacity_kg)
        new_cap = max(0.0, prev_cap - float(donation.total_weight_kg))
        org.current_capacity_kg = new_cap

        pickup.status = PickupStatus.FAILED
        pickup.notes = f"{pickup.notes or ''}\nFailure Reason: {fail_data.failure_reason}".strip()
        donation.status = DonationStatus.FAILED_DELIVERY

        db.add(AuditLog(
            actor_id=user.id,
            action="PICKUP_FAILED",
            entity_type="pickup",
            entity_id=pickup.id,
            previous_state={"status": pickup.status.value},
            new_state={
                "status": PickupStatus.FAILED.value,
                "failure_reason": fail_data.failure_reason,
            },
            ip_address=ip_address,
        ))

        db.add(AuditLog(
            actor_id=user.id,
            action="CAPACITY_RELEASED",
            entity_type="organization",
            entity_id=org.id,
            previous_state={"current_capacity_kg": prev_cap},
            new_state={"current_capacity_kg": new_cap, "failed_pickup_id": str(pickup.id)},
            ip_address=ip_address,
        ))

        # Restore volunteer availability if assigned
        if pickup.volunteer_id:
            stmt_vol = select(Volunteer).where(Volunteer.id == pickup.volunteer_id).with_for_update()
            res_vol = await db.execute(stmt_vol)
            vol = res_vol.scalar_one_or_none()
            if vol:
                vol.is_available = True
                db.add(AuditLog(
                    actor_id=user.id,
                    action="VOLUNTEER_AVAILABILITY_CHANGED",
                    entity_type="volunteer",
                    entity_id=vol.id,
                    previous_state={"is_available": False},
                    new_state={"is_available": True, "reason": "pickup_failed"},
                    ip_address=ip_address,
                ))

        # Notify donor and organization of failed pickup attempt
        business = await BusinessService.get_profile_by_id(db, donation.business_id)
        if business:
            await NotificationService.create_notification(
                db=db,
                recipient_id=business.user_id,
                title="Pickup Failed",
                message=f"Pickup attempt for donation '{donation.title}' failed. Reason: {fail_data.failure_reason}",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )
        if org:
            await NotificationService.create_notification(
                db=db,
                recipient_id=org.user_id,
                title="Pickup Failed",
                message=f"Pickup attempt for donation '{donation.title}' failed. Reason: {fail_data.failure_reason}",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        await db.commit()
        await db.refresh(pickup)
        return pickup
