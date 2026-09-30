from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import DonationStatus, MatchStatus, NotificationType, OrgVerificationStatus, UserRole
from app.models.match import DonationMatch
from app.models.organization import Organization
from app.models.user import User
from app.schemas.match import MatchAcceptRequest, MatchDeclineRequest, MatchOfferCreate
from app.services.business_service import BusinessService
from app.services.donation_service import DonationService
from app.services.matching_service import INELIGIBLE_DONATION_STATUSES, MatchingService
from app.services.notification_service import NotificationService
from app.services.organization_service import OrganizationService


class MatchService:
    @staticmethod
    async def create_match_offer(
        db: AsyncSession,
        user: User,
        donation_id: UUID,
        offer_data: MatchOfferCreate,
        ip_address: Optional[str] = None,
    ) -> DonationMatch:
        """
        Create and persist a formal Match Offer from a food business donor to an eligible recipient organization.
        Validates ownership, donation eligibility, organization verification, category compatibility,
        capacity, and spatial proximity before persistence.
        """
        # 1. Verify donation ownership
        business = await BusinessService.get_profile_by_user_id(db, user.id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Food business profile not found.",
            )

        donation = await DonationService.get_donation_by_id(db, donation_id)
        if not donation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Donation not found.",
            )

        if donation.business_id != business.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create match offers for this donation.",
            )

        # 2. Verify donation eligibility
        if donation.status in INELIGIBLE_DONATION_STATUSES or donation.status == DonationStatus.MATCHED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Donation is not eligible for new match offers (status: {donation.status.value}).",
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

        # 3. Verify recipient organization
        org = await OrganizationService.get_profile_by_id(db, offer_data.organization_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipient organization not found.",
            )

        if org.verification_status != OrgVerificationStatus.VERIFIED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient organization is not verified.",
            )

        # 4. Verify dietary / food category compatibility
        if donation.food_category.value not in org.accepted_categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Organization does not accept food category '{donation.food_category.value}'.",
            )

        # 5. Verify capacity headroom
        avail_cap = float(org.max_capacity_kg) - float(org.current_capacity_kg)
        if avail_cap < float(donation.total_weight_kg):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient organization capacity. Available: {avail_cap:.1f}kg, Required: {float(donation.total_weight_kg):.1f}kg",
            )

        # 6. Check duplicate active match offers
        stmt_existing = select(DonationMatch).where(
            DonationMatch.donation_id == donation.id,
            DonationMatch.organization_id == org.id,
        )
        res_existing = await db.execute(stmt_existing)
        existing_match = res_existing.scalar_one_or_none()
        if existing_match:
            if existing_match.status in (MatchStatus.INVITED, MatchStatus.PROPOSED, MatchStatus.ACCEPTED):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An active match offer already exists for this organization and donation.",
                )

        # 7. Calculate distance & score using PostGIS expression
        dist_stmt = select(func.ST_Distance(org.location, donation.location))
        dist_res = await db.execute(dist_stmt)
        dist_val = dist_res.scalar()
        distance_meters = float(dist_val) if dist_val is not None else 0.0

        max_radius_meters = 25000.0  # 25 km standard matching radius
        score = MatchingService.calculate_candidate_score(
            distance_meters=distance_meters,
            max_radius_meters=max_radius_meters,
            donation_weight_kg=float(donation.total_weight_kg),
            available_capacity_kg=avail_cap,
            can_pickup=org.can_pickup,
        )

        new_match = DonationMatch(
            id=uuid4(),
            donation_id=donation.id,
            organization_id=org.id,
            distance_meters=round(Decimal(str(distance_meters)), 2),
            score=round(Decimal(str(score)), 2),
            rank_order=1,
            status=MatchStatus.INVITED,
            invited_at=now,
            created_at=now,
        )

        db.add(new_match)
        await db.flush()

        audit = AuditLog(
            actor_id=user.id,
            action="MATCH_OFFER_CREATED",
            entity_type="donation_match",
            entity_id=new_match.id,
            previous_state=None,
            new_state={
                "donation_id": str(donation.id),
                "organization_id": str(org.id),
                "status": new_match.status.value,
                "score": float(new_match.score),
                "distance_meters": float(new_match.distance_meters),
            },
            ip_address=ip_address,
        )
        db.add(audit)

        # Notify recipient organization user
        await NotificationService.create_notification(
            db=db,
            recipient_id=org.user_id,
            title="New Match Offer Available",
            message=f"You have a new surplus food donation match offer for '{donation.title}'.",
            notification_type=NotificationType.MATCH_INVITATION,
            related_entity_type="donation_match",
            related_entity_id=new_match.id,
        )

        await db.commit()
        await db.refresh(new_match)

        return new_match

    @staticmethod
    async def list_matches_for_organization(
        db: AsyncSession,
        user: User,
        status_filter: Optional[MatchStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[DonationMatch]:
        """List incoming match offers for the authenticated organization."""
        org = await OrganizationService.get_profile_by_user_id(db, user.id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization profile not found.",
            )

        stmt = (
            select(DonationMatch)
            .where(DonationMatch.organization_id == org.id)
            .order_by(desc(DonationMatch.created_at))
            .offset(offset)
            .limit(limit)
        )
        if status_filter:
            stmt = stmt.where(DonationMatch.status == status_filter)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_matches_for_donation(
        db: AsyncSession,
        user: User,
        donation_id: UUID,
    ) -> List[DonationMatch]:
        """List all match offers created for a donation owned by the authenticated business."""
        donation = await DonationService.get_donation_by_id(db, donation_id)
        if not donation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Donation not found.",
            )

        if user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            if not business or donation.business_id != business.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view matches for this donation.",
                )
        elif user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden.",
            )

        stmt = (
            select(DonationMatch)
            .where(DonationMatch.donation_id == donation_id)
            .order_by(desc(DonationMatch.created_at))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_match_by_id(
        db: AsyncSession,
        user: User,
        match_id: UUID,
    ) -> DonationMatch:
        """
        Retrieve a single match by ID with strict multi-tenant authorization
        (accessible by donation owner, recipient organization, or admin).
        """
        stmt = select(DonationMatch).where(DonationMatch.id == match_id)
        result = await db.execute(stmt)
        match = result.scalar_one_or_none()
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found.",
            )

        if user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or match.organization_id != org.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view this match.",
                )
        elif user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            donation = await DonationService.get_donation_by_id(db, match.donation_id)
            if not business or not donation or donation.business_id != business.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view this match.",
                )
        elif user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this match.",
            )

        return match

    @staticmethod
    async def accept_match(
        db: AsyncSession,
        user: User,
        match_id: UUID,
        accept_data: MatchAcceptRequest,
        ip_address: Optional[str] = None,
    ) -> DonationMatch:
        """
        Atomically accept a match offer, reserve organization storage capacity,
        and transition the donation lifecycle state to MATCHED.

        Employs database row-level locking (SELECT ... FOR UPDATE) across the match,
        donation, and organization entities to guarantee isolation and prevent race conditions.
        """
        # 1. Lock and load the match record
        stmt_match = select(DonationMatch).where(DonationMatch.id == match_id).with_for_update()
        res_match = await db.execute(stmt_match)
        match = res_match.scalar_one_or_none()
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found.",
            )

        # 2. Verify recipient organization ownership
        org_profile = await OrganizationService.get_profile_by_user_id(db, user.id)
        if not org_profile or match.organization_id != org_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to accept this match.",
            )

        # 3. Check match lifecycle state & idempotency
        if match.status == MatchStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Match is already accepted.",
            )
        if match.status in (MatchStatus.DECLINED, MatchStatus.EXPIRED, MatchStatus.REVOKED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot accept match with status '{match.status.value}'.",
            )

        # 4. Lock and load donation
        stmt_don = select(Donation).where(Donation.id == match.donation_id).with_for_update()
        res_don = await db.execute(stmt_don)
        donation = res_don.scalar_one_or_none()
        if not donation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated donation not found.",
            )

        if donation.status == DonationStatus.MATCHED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Donation has already been claimed and matched by another organization.",
            )
        if donation.status in INELIGIBLE_DONATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Donation is no longer available (status: {donation.status.value}).",
            )

        now = datetime.now(timezone.utc)
        deadline = donation.pickup_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        if deadline <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Donation pickup deadline has passed.",
            )

        # 5. Lock and load organization
        stmt_org = select(Organization).where(Organization.id == match.organization_id).with_for_update()
        res_org = await db.execute(stmt_org)
        org = res_org.scalar_one_or_none()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found.",
            )

        # 6. Atomic capacity verification
        new_current_cap = float(org.current_capacity_kg) + float(donation.total_weight_kg)
        if new_current_cap > float(org.max_capacity_kg):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Insufficient capacity to accept donation. Headroom: {(float(org.max_capacity_kg) - float(org.current_capacity_kg)):.1f}kg, Required: {float(donation.total_weight_kg):.1f}kg",
            )

        # 7. Apply mutations atomically
        prev_org_cap = float(org.current_capacity_kg)
        org.current_capacity_kg = new_current_cap
        donation.status = DonationStatus.MATCHED
        match.status = MatchStatus.ACCEPTED
        match.responded_at = now

        # 8. Record audit trail
        db.add(AuditLog(
            actor_id=user.id,
            action="MATCH_ACCEPTED",
            entity_type="donation_match",
            entity_id=match.id,
            previous_state={"status": MatchStatus.INVITED.value},
            new_state={
                "status": MatchStatus.ACCEPTED.value,
                "transport_mode": accept_data.transport_mode.value,
                "donation_id": str(donation.id),
                "organization_id": str(org.id),
            },
            ip_address=ip_address,
        ))

        db.add(AuditLog(
            actor_id=user.id,
            action="CAPACITY_RESERVED",
            entity_type="organization",
            entity_id=org.id,
            previous_state={"current_capacity_kg": prev_org_cap},
            new_state={
                "current_capacity_kg": new_current_cap,
                "reserved_for_donation_id": str(donation.id),
            },
            ip_address=ip_address,
        ))

        # Notify donor kitchen user that match was accepted
        business = await BusinessService.get_profile_by_id(db, donation.business_id)
        if business:
            await NotificationService.create_notification(
                db=db,
                recipient_id=business.user_id,
                title="Donation Match Accepted",
                message=f"Organization '{org.org_name}' accepted your donation match offer for '{donation.title}'.",
                notification_type=NotificationType.MATCH_ACCEPTED,
                related_entity_type="donation_match",
                related_entity_id=match.id,
            )

        await db.commit()
        await db.refresh(match)
        return match

    @staticmethod
    async def decline_match(
        db: AsyncSession,
        user: User,
        match_id: UUID,
        decline_data: MatchDeclineRequest,
        ip_address: Optional[str] = None,
    ) -> DonationMatch:
        """
        Decline a match offer with a stated reason.
        Does NOT alter organization capacity or donation availability.
        """
        stmt_match = select(DonationMatch).where(DonationMatch.id == match_id).with_for_update()
        res_match = await db.execute(stmt_match)
        match = res_match.scalar_one_or_none()
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found.",
            )

        org_profile = await OrganizationService.get_profile_by_user_id(db, user.id)
        if not org_profile or match.organization_id != org_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to decline this match.",
            )

        if match.status == MatchStatus.DECLINED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Match is already declined.",
            )
        if match.status == MatchStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot decline an already accepted match.",
            )
        if match.status in (MatchStatus.EXPIRED, MatchStatus.REVOKED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot decline match in status '{match.status.value}'.",
            )

        now = datetime.now(timezone.utc)
        prev_status = match.status.value
        match.status = MatchStatus.DECLINED
        match.rejection_reason = decline_data.rejection_reason
        match.responded_at = now

        db.add(AuditLog(
            actor_id=user.id,
            action="MATCH_OFFER_DECLINED",
            entity_type="donation_match",
            entity_id=match.id,
            previous_state={"status": prev_status},
            new_state={
                "status": MatchStatus.DECLINED.value,
                "rejection_reason": decline_data.rejection_reason,
            },
            ip_address=ip_address,
        ))

        # Notify donor kitchen user that match was declined
        donation = await DonationService.get_donation_by_id(db, match.donation_id)
        if donation:
            business = await BusinessService.get_profile_by_id(db, donation.business_id)
            if business:
                await NotificationService.create_notification(
                    db=db,
                    recipient_id=business.user_id,
                    title="Donation Match Declined",
                    message=f"Organization '{org_profile.org_name}' declined match offer for '{donation.title}'.",
                    notification_type=NotificationType.MATCH_DECLINED,
                    related_entity_type="donation_match",
                    related_entity_id=match.id,
                )

        await db.commit()
        await db.refresh(match)
        return match
