from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import DonationStatus
from app.models.user import User
from app.schemas.donation import DonationCancelRequest, DonationCreate, DonationUpdate
from app.services.business_service import BusinessService
from app.services.food_safety_service import FoodSafetyService


TERMINAL_DONATION_STATUSES = {
    DonationStatus.CANCELLED,
    DonationStatus.DELIVERED,
    DonationStatus.EXPIRED,
    DonationStatus.FAILED_DELIVERY,
}


class DonationService:
    @staticmethod
    async def get_donation_by_id(
        db: AsyncSession,
        donation_id: UUID,
    ) -> Optional[Donation]:
        """Query a single donation by its primary UUID."""
        stmt = select(Donation).where(Donation.id == donation_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_donations_for_business(
        db: AsyncSession,
        business_id: UUID,
        status_filter: Optional[DonationStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Donation]:
        """
        List donations belonging exclusively to the given food business ID,
        ordered by most recently created first.
        """
        stmt = (
            select(Donation)
            .where(Donation.business_id == business_id)
            .order_by(desc(Donation.created_at))
            .offset(offset)
            .limit(limit)
        )
        if status_filter:
            stmt = stmt.where(Donation.status == status_filter)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create_donation(
        db: AsyncSession,
        user: User,
        data: DonationCreate,
        ip_address: Optional[str] = None,
    ) -> Donation:
        """
        Create a new surplus food donation for the authenticated FOOD_BUSINESS user.
        Resolves food business profile to establish ownership securely.
        Runs food-safety and temporal validation before persistence.
        Records an audit log entry.
        """
        business = await BusinessService.get_profile_by_user_id(db, user.id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Food business profile not found. Please create your business profile before posting donations.",
            )

        # Resolve available_from if omitted
        available_from = data.available_from or datetime.now(timezone.utc)

        # Run food safety & domain validations
        FoodSafetyService.validate_quantities(
            quantity_value=data.quantity_value,
            total_weight_kg=data.total_weight_kg,
        )
        FoodSafetyService.validate_temporal_window(
            available_from=available_from,
            pickup_deadline=data.pickup_deadline,
            safe_consumption_deadline=data.safe_consumption_deadline,
            preparation_time=data.preparation_time,
        )

        # Convert API location {lat, lon} to PostGIS POINT
        location_elem = WKTElement(
            f"POINT({data.location.longitude} {data.location.latitude})",
            srid=4326,
        )

        now = datetime.now(timezone.utc)
        new_donation = Donation(
            id=uuid4(),
            business_id=business.id,
            title=data.title,
            food_category=data.food_category,
            quantity_value=float(data.quantity_value),
            quantity_unit=data.quantity_unit,
            total_weight_kg=float(data.total_weight_kg),
            storage_condition=data.storage_condition,
            packaging_type=data.packaging_type,
            preparation_time=data.preparation_time,
            available_from=available_from,
            pickup_deadline=data.pickup_deadline,
            safe_consumption_deadline=data.safe_consumption_deadline,
            location=location_elem,
            pickup_notes=data.pickup_notes,
            image_url=data.image_url,
            status=DonationStatus.CREATED,
            created_at=now,
            updated_at=now,
        )

        db.add(new_donation)
        await db.flush()

        # Audit log creation
        audit = AuditLog(
            actor_id=user.id,
            action="DONATION_CREATED",
            entity_type="donation",
            entity_id=new_donation.id,
            previous_state=None,
            new_state={
                "business_id": str(business.id),
                "title": new_donation.title,
                "food_category": new_donation.food_category.value,
                "quantity_value": float(new_donation.quantity_value),
                "quantity_unit": new_donation.quantity_unit.value,
                "total_weight_kg": float(new_donation.total_weight_kg),
                "storage_condition": new_donation.storage_condition.value,
                "status": new_donation.status.value,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(new_donation)

        return new_donation

    @staticmethod
    async def update_donation(
        db: AsyncSession,
        user: User,
        donation_id: UUID,
        update_data: DonationUpdate,
        ip_address: Optional[str] = None,
    ) -> Donation:
        """
        Partially update an existing donation listing owned by the authenticated business.
        Enforces ownership, prevents modification of terminal states,
        and re-runs domain validation on merged attributes.
        """
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

        # Enforce strict ownership
        if donation.business_id != business.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this donation.",
            )

        # Check terminal lifecycle states
        if donation.status in TERMINAL_DONATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update donation in terminal state: {donation.status.value}",
            )

        prev_state = {
            "title": donation.title,
            "food_category": donation.food_category.value,
            "quantity_value": float(donation.quantity_value),
            "quantity_unit": donation.quantity_unit.value,
            "total_weight_kg": float(donation.total_weight_kg),
            "storage_condition": donation.storage_condition.value,
            "packaging_type": donation.packaging_type,
            "pickup_deadline": donation.pickup_deadline.isoformat(),
            "safe_consumption_deadline": donation.safe_consumption_deadline.isoformat(),
            "status": donation.status.value,
        }

        update_dict = update_data.model_dump(exclude_unset=True)

        # Compute merged temporal and numeric fields for domain re-validation
        merged_qty_val = update_data.quantity_value if update_data.quantity_value is not None else donation.quantity_value
        merged_weight = update_data.total_weight_kg if update_data.total_weight_kg is not None else donation.total_weight_kg
        merged_avail = update_data.available_from if update_data.available_from is not None else donation.available_from
        merged_pickup_dl = update_data.pickup_deadline if update_data.pickup_deadline is not None else donation.pickup_deadline
        merged_safe_dl = update_data.safe_consumption_deadline if update_data.safe_consumption_deadline is not None else donation.safe_consumption_deadline
        merged_prep_time = update_data.preparation_time if "preparation_time" in update_dict else donation.preparation_time

        FoodSafetyService.validate_quantities(
            quantity_value=merged_qty_val,
            total_weight_kg=merged_weight,
        )
        FoodSafetyService.validate_temporal_window(
            available_from=merged_avail,
            pickup_deadline=merged_pickup_dl,
            safe_consumption_deadline=merged_safe_dl,
            preparation_time=merged_prep_time,
        )

        for key, value in update_dict.items():
            if key == "location" and update_data.location is not None:
                donation.location = WKTElement(
                    f"POINT({update_data.location.longitude} {update_data.location.latitude})",
                    srid=4326,
                )
            elif key in ("quantity_value", "total_weight_kg") and value is not None:
                setattr(donation, key, float(value))
            else:
                setattr(donation, key, value)

        audit = AuditLog(
            actor_id=user.id,
            action="DONATION_UPDATED",
            entity_type="donation",
            entity_id=donation.id,
            previous_state=prev_state,
            new_state={
                "title": donation.title,
                "food_category": donation.food_category.value,
                "quantity_value": float(donation.quantity_value),
                "quantity_unit": donation.quantity_unit.value,
                "total_weight_kg": float(donation.total_weight_kg),
                "storage_condition": donation.storage_condition.value,
                "packaging_type": donation.packaging_type,
                "pickup_deadline": donation.pickup_deadline.isoformat(),
                "safe_consumption_deadline": donation.safe_consumption_deadline.isoformat(),
                "status": donation.status.value,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(donation)

        return donation

    @staticmethod
    async def cancel_donation(
        db: AsyncSession,
        user: User,
        donation_id: UUID,
        cancel_data: DonationCancelRequest,
        ip_address: Optional[str] = None,
    ) -> Donation:
        """
        Cancel an active donation listing.
        Enforces ownership, transitions status to CANCELLED,
        stores the mandatory cancellation reason, and records an audit log.
        Rejects cancellation if the donation is already in a terminal state.
        """
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

        # Enforce strict ownership
        if donation.business_id != business.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to cancel this donation.",
            )

        if donation.status == DonationStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Donation is already cancelled.",
            )

        if donation.status in TERMINAL_DONATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel donation in terminal state: {donation.status.value}",
            )

        prev_status = donation.status.value

        donation.status = DonationStatus.CANCELLED
        donation.cancellation_reason = cancel_data.cancellation_reason

        audit = AuditLog(
            actor_id=user.id,
            action="DONATION_CANCELLED",
            entity_type="donation",
            entity_id=donation.id,
            previous_state={"status": prev_status},
            new_state={
                "status": DonationStatus.CANCELLED.value,
                "cancellation_reason": donation.cancellation_reason,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(donation)

        return donation
