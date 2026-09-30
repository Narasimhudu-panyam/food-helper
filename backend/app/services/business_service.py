from typing import Optional
from uuid import UUID
from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import FoodBusiness
from app.models.user import User
from app.schemas.food_business import FoodBusinessCreate, FoodBusinessUpdate


class BusinessService:
    @staticmethod
    async def get_profile_by_user_id(
        db: AsyncSession,
        user_id: UUID,
    ) -> Optional[FoodBusiness]:
        """Query a food business profile by its owning user UUID."""
        stmt = select(FoodBusiness).where(FoodBusiness.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_profile_by_id(
        db: AsyncSession,
        business_id: UUID,
    ) -> Optional[FoodBusiness]:
        """Query a food business profile by its primary key UUID."""
        stmt = select(FoodBusiness).where(FoodBusiness.id == business_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_profile(
        db: AsyncSession,
        user: User,
        profile_data: FoodBusinessCreate,
    ) -> FoodBusiness:
        """
        Create and persist a food business profile for an authenticated FOOD_BUSINESS user.
        Rejects duplicate profile creation attempts.
        """
        existing_profile = await BusinessService.get_profile_by_user_id(db, user.id)
        if existing_profile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A food business profile already exists for this account",
            )

        # Convert API {latitude, longitude} to PostGIS POINT(lon lat)
        location_elem = WKTElement(
            f"POINT({profile_data.location.longitude} {profile_data.location.latitude})",
            srid=4326,
        )

        new_profile = FoodBusiness(
            user_id=user.id,
            business_name=profile_data.business_name,
            business_type=profile_data.business_type,
            address_text=profile_data.address_text,
            location=location_elem,
            contact_phone=profile_data.contact_phone,
            pickup_instructions=profile_data.pickup_instructions,
        )

        db.add(new_profile)
        await db.commit()
        await db.refresh(new_profile)

        return new_profile

    @staticmethod
    async def update_profile(
        db: AsyncSession,
        user: User,
        update_data: FoodBusinessUpdate,
    ) -> FoodBusiness:
        """
        Partially update an existing food business profile owned by the authenticated user.
        """
        profile = await BusinessService.get_profile_by_user_id(db, user.id)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Food business profile not found. Please create your profile first.",
            )

        update_dict = update_data.model_dump(exclude_unset=True)

        for key, value in update_dict.items():
            if key == "location" and update_data.location is not None:
                profile.location = WKTElement(
                    f"POINT({update_data.location.longitude} {update_data.location.latitude})",
                    srid=4326,
                )
            else:
                setattr(profile, key, value)

        await db.commit()
        await db.refresh(profile)

        return profile
