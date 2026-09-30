from typing import Optional
from uuid import UUID
from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.volunteer import VolunteerCreate, VolunteerUpdate


class VolunteerService:
    @staticmethod
    async def get_profile_by_user_id(
        db: AsyncSession,
        user_id: UUID,
    ) -> Optional[Volunteer]:
        """Query a volunteer profile by its owning user UUID."""
        stmt = select(Volunteer).where(Volunteer.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_profile_by_id(
        db: AsyncSession,
        volunteer_id: UUID,
    ) -> Optional[Volunteer]:
        """Query a volunteer profile by its primary key UUID."""
        stmt = select(Volunteer).where(Volunteer.id == volunteer_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_profile(
        db: AsyncSession,
        user: User,
        profile_data: VolunteerCreate,
        ip_address: Optional[str] = None,
    ) -> Volunteer:
        """
        Create and persist a volunteer profile for an authenticated VOLUNTEER user.
        Rejects duplicate profile creation attempts with 409 Conflict.
        Records an audit log entry.
        """
        existing_profile = await VolunteerService.get_profile_by_user_id(db, user.id)
        if existing_profile:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A volunteer profile already exists for this account",
            )

        if profile_data.service_radius_km <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service radius must be greater than 0 km",
            )

        location_elem = None
        if profile_data.home_location is not None:
            location_elem = WKTElement(
                f"POINT({profile_data.home_location.longitude} {profile_data.home_location.latitude})",
                srid=4326,
            )

        new_volunteer = Volunteer(
            user_id=user.id,
            full_name=profile_data.full_name,
            contact_phone=profile_data.contact_phone,
            vehicle_type=profile_data.vehicle_type,
            has_insulated_bags=profile_data.has_insulated_bags,
            home_location=location_elem,
            service_radius_km=profile_data.service_radius_km,
            is_available=True,
        )

        db.add(new_volunteer)
        await db.flush()

        # Audit log creation
        audit = AuditLog(
            actor_id=user.id,
            action="VOLUNTEER_PROFILE_CREATED",
            entity_type="volunteer",
            entity_id=new_volunteer.id,
            previous_state=None,
            new_state={
                "full_name": new_volunteer.full_name,
                "vehicle_type": new_volunteer.vehicle_type.value,
                "has_insulated_bags": new_volunteer.has_insulated_bags,
                "service_radius_km": float(new_volunteer.service_radius_km),
                "is_available": new_volunteer.is_available,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(new_volunteer)

        return new_volunteer

    @staticmethod
    async def update_profile(
        db: AsyncSession,
        user: User,
        update_data: VolunteerUpdate,
        ip_address: Optional[str] = None,
    ) -> Volunteer:
        """
        Partially update an existing volunteer profile owned by the authenticated user.
        Records an audit log entry.
        """
        volunteer = await VolunteerService.get_profile_by_user_id(db, user.id)
        if not volunteer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Volunteer profile not found. Please create your profile first.",
            )

        prev_state = {
            "full_name": volunteer.full_name,
            "vehicle_type": volunteer.vehicle_type.value,
            "has_insulated_bags": volunteer.has_insulated_bags,
            "service_radius_km": float(volunteer.service_radius_km),
            "is_available": volunteer.is_available,
        }

        if update_data.service_radius_km is not None and update_data.service_radius_km <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service radius must be greater than 0 km",
            )

        update_dict = update_data.model_dump(exclude_unset=True)

        for key, value in update_dict.items():
            if key == "home_location":
                if update_data.home_location is not None:
                    volunteer.home_location = WKTElement(
                        f"POINT({update_data.home_location.longitude} {update_data.home_location.latitude})",
                        srid=4326,
                    )
                else:
                    volunteer.home_location = None
            else:
                setattr(volunteer, key, value)

        action = "VOLUNTEER_AVAILABILITY_CHANGED" if (set(update_dict.keys()) == {"is_available"}) else "VOLUNTEER_PROFILE_UPDATED"

        audit = AuditLog(
            actor_id=user.id,
            action=action,
            entity_type="volunteer",
            entity_id=volunteer.id,
            previous_state=prev_state,
            new_state={
                "full_name": volunteer.full_name,
                "vehicle_type": volunteer.vehicle_type.value,
                "has_insulated_bags": volunteer.has_insulated_bags,
                "service_radius_km": float(volunteer.service_radius_km),
                "is_available": volunteer.is_available,
            },
            ip_address=ip_address,
        )
        db.add(audit)

        await db.commit()
        await db.refresh(volunteer)

        return volunteer
