from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import NotificationType, PickupStatus, StorageCondition, TransportMode, UserRole, VehicleType
from app.models.organization import Organization
from app.models.pickup import Pickup
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.pickup import (
    CandidateVolunteerMatchResponse,
    PickupVolunteerMatchListResponse,
)
from app.services.business_service import BusinessService
from app.services.donation_service import DonationService
from app.services.notification_service import NotificationService
from app.services.organization_service import OrganizationService
from app.services.volunteer_service import VolunteerService


class VolunteerDispatchService:
    """
    Geospatial dispatch matching, assignment, and release service
    for volunteer food transport couriers.
    """

    @staticmethod
    def calculate_volunteer_score(
        distance_meters: float,
        service_radius_meters: float,
        vehicle_type: VehicleType,
        has_insulated_bags: bool,
        service_radius_km: float,
    ) -> float:
        """
        Calculate a normalized, deterministic volunteer dispatch score (0.0 to 100.0).

        Weights:
        - Proximity (50%): closer distance relative to volunteer radius
        - Vehicle Capability (25%): VAN_TRUCK=1.0, CAR=0.8, OTHER=0.6, FOOT_BIKE=0.5
        - Equipment (15%): insulated bags = 1.0, standard = 0.5
        - Radius Willingness (10%): min(1.0, radius_km / 50.0)
        """
        # 1. Proximity score (0.0 to 1.0)
        if service_radius_meters > 0:
            s_dist = max(0.0, min(1.0, 1.0 - (distance_meters / service_radius_meters)))
        else:
            s_dist = 1.0

        # 2. Vehicle score (0.5 to 1.0)
        if vehicle_type == VehicleType.VAN_TRUCK:
            s_veh = 1.0
        elif vehicle_type == VehicleType.CAR:
            s_veh = 0.8
        elif vehicle_type == VehicleType.OTHER:
            s_veh = 0.6
        else:  # FOOT_BIKE
            s_veh = 0.5

        # 3. Equipment score (0.5 or 1.0)
        s_equip = 1.0 if has_insulated_bags else 0.5

        # 4. Radius willingness score (0.0 to 1.0)
        s_radius = min(1.0, service_radius_km / 50.0)

        composite = (0.50 * s_dist) + (0.25 * s_veh) + (0.15 * s_equip) + (0.10 * s_radius)
        return round(composite * 100.0, 2)

    @staticmethod
    def build_volunteer_match_reasons(
        volunteer: Volunteer,
        distance_km: float,
        donation: Donation,
    ) -> List[str]:
        """Build clear, structured explanation reasons for volunteer dispatch candidacy."""
        reasons = [
            "available_courier",
            f"within_service_radius: {distance_km:.2f}km <= {float(volunteer.service_radius_km):.1f}km",
            f"vehicle_capability: {volunteer.vehicle_type.value}",
        ]
        if volunteer.has_insulated_bags:
            reasons.append("insulated_thermal_equipment_ready")
        else:
            reasons.append("standard_ambient_transport")

        if donation.storage_condition in (StorageCondition.REFRIGERATED, StorageCondition.FROZEN, StorageCondition.HOT_HOLDING):
            reasons.append(f"meets_thermal_requirement: {donation.storage_condition.value}")

        return reasons

    @staticmethod
    async def find_eligible_volunteers_for_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
    ) -> PickupVolunteerMatchListResponse:
        """
        Discover and rank available, qualified volunteer couriers within spatial range
        for a specific pickup requiring volunteer transport.
        """
        # Fetch pickup
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id)
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pickup not found.",
            )

        # Multi-tenant authorization check
        if user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
            if not business or not donation or donation.business_id != business.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view volunteer matches for this pickup.",
                )
        elif user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or pickup.organization_id != org.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view volunteer matches for this pickup.",
                )
        elif user.role == UserRole.VOLUNTEER:
            vol = await VolunteerService.get_profile_by_user_id(db, user.id)
            if not vol:
                raise HTTPException(status_code=404, detail="Volunteer profile not found.")
        elif user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access forbidden.")

        # Validate logistics transport mode
        if pickup.transport_mode != TransportMode.VOLUNTEER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pickup does not require volunteer courier transport (transport mode is ORG_DIRECT).",
            )

        if pickup.status in (PickupStatus.DELIVERED, PickupStatus.CANCELLED, PickupStatus.FAILED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot find volunteers for pickup in terminal status '{pickup.status.value}'.",
            )

        donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
        if not donation:
            raise HTTPException(status_code=404, detail="Associated donation not found.")

        # Subquery to exclude volunteers with currently active assignments
        active_pickup_volunteers = (
            select(Pickup.volunteer_id)
            .where(
                Pickup.volunteer_id.is_not(None),
                Pickup.status.in_([
                    PickupStatus.ASSIGNED,
                    PickupStatus.EN_ROUTE_TO_PICKUP,
                    PickupStatus.ARRIVED_AT_PICKUP,
                    PickupStatus.IN_TRANSIT,
                ]),
            )
            .scalar_subquery()
        )

        # Database PostGIS spatial query + hard constraint filtering
        dist_expr = func.ST_Distance(Volunteer.home_location, donation.location)
        stmt_vols = (
            select(
                Volunteer,
                dist_expr.label("distance_meters"),
            )
            .where(
                Volunteer.is_available.is_(True),
                Volunteer.home_location.is_not(None),
                Volunteer.id.not_in(active_pickup_volunteers),
                func.ST_DWithin(
                    Volunteer.home_location,
                    donation.location,
                    Volunteer.service_radius_km * 1000.0,
                ),
            )
        )

        # Thermal storage requirement filter
        if donation.storage_condition in (
            StorageCondition.REFRIGERATED,
            StorageCondition.FROZEN,
            StorageCondition.HOT_HOLDING,
        ):
            stmt_vols = stmt_vols.where(Volunteer.has_insulated_bags.is_(True))

        # Heavy weight constraint filter (>= 30kg requires motorized/cargo transport)
        if float(donation.total_weight_kg) >= 30.0:
            stmt_vols = stmt_vols.where(Volunteer.vehicle_type != VehicleType.FOOT_BIKE)

        res_vols = await db.execute(stmt_vols)
        candidates_raw: List[Tuple[Volunteer, float]] = res_vols.all()

        evaluated_candidates = []
        for vol, dist_m in candidates_raw:
            dist_meters = float(dist_m)
            dist_km = dist_meters / 1000.0
            radius_km = float(vol.service_radius_km)
            radius_meters = radius_km * 1000.0

            score = VolunteerDispatchService.calculate_volunteer_score(
                distance_meters=dist_meters,
                service_radius_meters=radius_meters,
                vehicle_type=vol.vehicle_type,
                has_insulated_bags=vol.has_insulated_bags,
                service_radius_km=radius_km,
            )

            reasons = VolunteerDispatchService.build_volunteer_match_reasons(
                volunteer=vol,
                distance_km=dist_km,
                donation=donation,
            )

            evaluated_candidates.append({
                "volunteer_id": vol.id,
                "full_name": vol.full_name,
                "vehicle_type": vol.vehicle_type,
                "has_insulated_bags": vol.has_insulated_bags,
                "distance_km": round(dist_km, 2),
                "distance_meters": round(dist_meters, 2),
                "service_radius_km": round(radius_km, 2),
                "score": score,
                "match_reasons": reasons,
            })

        # Deterministic sorting: score DESC, distance_meters ASC, volunteer_id ASC
        evaluated_candidates.sort(
            key=lambda c: (-c["score"], c["distance_meters"], str(c["volunteer_id"]))
        )

        ranked_matches = []
        for rank_idx, cand in enumerate(evaluated_candidates, start=1):
            ranked_matches.append(
                CandidateVolunteerMatchResponse(
                    volunteer_id=cand["volunteer_id"],
                    full_name=cand["full_name"],
                    vehicle_type=cand["vehicle_type"],
                    has_insulated_bags=cand["has_insulated_bags"],
                    distance_km=cand["distance_km"],
                    distance_meters=cand["distance_meters"],
                    service_radius_km=cand["service_radius_km"],
                    score=cand["score"],
                    rank=rank_idx,
                    match_reasons=cand["match_reasons"],
                )
            )

        return PickupVolunteerMatchListResponse(
            pickup_id=pickup.id,
            total_candidates_found=len(ranked_matches),
            matches=ranked_matches,
        )

    @staticmethod
    async def assign_volunteer_to_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
        volunteer_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Atomically assign or claim a volunteer courier for a pickup using row-level locking.
        """
        # Determine target volunteer ID based on caller role
        target_vol_id = volunteer_id
        if user.role == UserRole.VOLUNTEER:
            vol_profile = await VolunteerService.get_profile_by_user_id(db, user.id)
            if not vol_profile:
                raise HTTPException(status_code=404, detail="Volunteer profile not found.")
            if volunteer_id and volunteer_id != vol_profile.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Volunteers can only claim transport tasks for themselves.",
                )
            target_vol_id = vol_profile.id
        elif not target_vol_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="volunteer_id is required for dispatcher assignment.",
            )

        # 1. Lock pickup row
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id).with_for_update()
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(status_code=404, detail="Pickup not found.")

        # Multi-tenant permission check
        if user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or pickup.organization_id != org.id:
                raise HTTPException(status_code=403, detail="You do not have permission to assign volunteers to this pickup.")
        elif user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
            if not business or not donation or donation.business_id != business.id:
                raise HTTPException(status_code=403, detail="You do not have permission to assign volunteers to this pickup.")
        elif user.role not in (UserRole.VOLUNTEER, UserRole.ADMIN):
            raise HTTPException(status_code=403, detail="Access forbidden.")

        if pickup.transport_mode != TransportMode.VOLUNTEER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot assign volunteer to pickup with transport mode ORG_DIRECT.",
            )

        if pickup.status != PickupStatus.ASSIGNED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign volunteer to pickup in status '{pickup.status.value}'.",
            )

        if pickup.volunteer_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Pickup is already assigned to a volunteer courier.",
            )

        # 2. Lock volunteer row
        stmt_vol = select(Volunteer).where(Volunteer.id == target_vol_id).with_for_update()
        res_vol = await db.execute(stmt_vol)
        volunteer = res_vol.scalar_one_or_none()
        if not volunteer:
            raise HTTPException(status_code=404, detail="Volunteer not found.")

        if not volunteer.is_available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Volunteer is currently unavailable or already assigned to an active delivery.",
            )

        # Update assignment and toggle availability
        pickup.volunteer_id = volunteer.id
        volunteer.is_available = False

        db.add(AuditLog(
            actor_id=user.id,
            action="PICKUP_VOLUNTEER_ASSIGNED",
            entity_type="pickup",
            entity_id=pickup.id,
            previous_state={"volunteer_id": None},
            new_state={"volunteer_id": str(volunteer.id)},
            ip_address=ip_address,
        ))

        db.add(AuditLog(
            actor_id=user.id,
            action="VOLUNTEER_AVAILABILITY_CHANGED",
            entity_type="volunteer",
            entity_id=volunteer.id,
            previous_state={"is_available": True},
            new_state={"is_available": False, "assigned_pickup_id": str(pickup.id)},
            ip_address=ip_address,
        ))

        # Notify volunteer, recipient organization, and donor business
        donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
        org = await OrganizationService.get_profile_by_id(db, pickup.organization_id)
        business = await BusinessService.get_profile_by_id(db, donation.business_id) if donation else None

        # 1. Notify volunteer
        await NotificationService.create_notification(
            db=db,
            recipient_id=volunteer.user_id,
            title="Transport Task Assigned",
            message=f"You have been assigned to transport surplus food donation '{donation.title if donation else 'surplus food'}'.",
            notification_type=NotificationType.PICKUP_ASSIGNED,
            related_entity_type="pickup",
            related_entity_id=pickup.id,
        )

        # 2. Notify organization
        if org:
            await NotificationService.create_notification(
                db=db,
                recipient_id=org.user_id,
                title="Volunteer Assigned to Pickup",
                message=f"Volunteer courier '{volunteer.full_name}' was assigned to your incoming delivery for '{donation.title if donation else 'surplus food'}'.",
                notification_type=NotificationType.PICKUP_ASSIGNED,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        # 3. Notify donor business
        if business:
            await NotificationService.create_notification(
                db=db,
                recipient_id=business.user_id,
                title="Volunteer Assigned for Pickup",
                message=f"Volunteer courier '{volunteer.full_name}' has been assigned to pick up donation '{donation.title}'.",
                notification_type=NotificationType.PICKUP_ASSIGNED,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        await db.commit()
        await db.refresh(pickup)
        return pickup

    @staticmethod
    async def release_volunteer_from_pickup(
        db: AsyncSession,
        user: User,
        pickup_id: UUID,
        ip_address: Optional[str] = None,
    ) -> Pickup:
        """
        Release or unclaim an assigned volunteer courier from a pickup before in-transit,
        restoring the volunteer's availability.
        """
        # 1. Lock pickup row
        stmt_pickup = select(Pickup).where(Pickup.id == pickup_id).with_for_update()
        res_pickup = await db.execute(stmt_pickup)
        pickup = res_pickup.scalar_one_or_none()
        if not pickup:
            raise HTTPException(status_code=404, detail="Pickup not found.")

        if pickup.volunteer_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pickup does not have an assigned volunteer courier to release.",
            )

        # Multi-tenant permission check
        if user.role == UserRole.VOLUNTEER:
            vol_profile = await VolunteerService.get_profile_by_user_id(db, user.id)
            if not vol_profile or pickup.volunteer_id != vol_profile.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only release/unclaim pickups assigned to yourself.",
                )
        elif user.role == UserRole.ORGANIZATION:
            org = await OrganizationService.get_profile_by_user_id(db, user.id)
            if not org or pickup.organization_id != org.id:
                raise HTTPException(status_code=403, detail="You do not have permission to release volunteer from this pickup.")
        elif user.role == UserRole.FOOD_BUSINESS:
            business = await BusinessService.get_profile_by_user_id(db, user.id)
            donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
            if not business or not donation or donation.business_id != business.id:
                raise HTTPException(status_code=403, detail="You do not have permission to release volunteer from this pickup.")
        elif user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access forbidden.")

        if pickup.status != PickupStatus.ASSIGNED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot release volunteer from pickup in status '{pickup.status.value}'. Couriers cannot unassign once delivery has started.",
            )

        released_vol_id = pickup.volunteer_id

        # 2. Lock volunteer row and restore availability
        stmt_vol = select(Volunteer).where(Volunteer.id == released_vol_id).with_for_update()
        res_vol = await db.execute(stmt_vol)
        volunteer = res_vol.scalar_one_or_none()
        if volunteer:
            volunteer.is_available = True
            db.add(AuditLog(
                actor_id=user.id,
                action="VOLUNTEER_AVAILABILITY_CHANGED",
                entity_type="volunteer",
                entity_id=volunteer.id,
                previous_state={"is_available": False},
                new_state={"is_available": True, "released_from_pickup_id": str(pickup.id)},
                ip_address=ip_address,
            ))

        pickup.volunteer_id = None

        db.add(AuditLog(
            actor_id=user.id,
            action="PICKUP_VOLUNTEER_RELEASED",
            entity_type="pickup",
            entity_id=pickup.id,
            previous_state={"volunteer_id": str(released_vol_id)},
            new_state={"volunteer_id": None},
            ip_address=ip_address,
        ))

        # Notify organization and released volunteer if released by dispatcher
        donation = await DonationService.get_donation_by_id(db, pickup.donation_id)
        org = await OrganizationService.get_profile_by_id(db, pickup.organization_id)
        if org:
            await NotificationService.create_notification(
                db=db,
                recipient_id=org.user_id,
                title="Volunteer Courier Unassigned",
                message=f"Volunteer courier was unassigned from pickup task for '{donation.title if donation else 'surplus food'}'. A new courier can be dispatched.",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        if volunteer and user.role != UserRole.VOLUNTEER:
            await NotificationService.create_notification(
                db=db,
                recipient_id=volunteer.user_id,
                title="Transport Task Unassigned",
                message=f"You have been unassigned from pickup task for '{donation.title if donation else 'surplus food'}'.",
                notification_type=NotificationType.PICKUP_STATUS_UPDATE,
                related_entity_type="pickup",
                related_entity_id=pickup.id,
            )

        await db.commit()
        await db.refresh(pickup)
        return pickup
