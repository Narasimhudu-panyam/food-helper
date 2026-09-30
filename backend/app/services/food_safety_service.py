from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException, status

from app.models.enums import FoodCategory, QuantityUnit, StorageCondition


class FoodSafetyService:
    """
    Food safety and domain validation service for surplus food donations.

    DISCLAIMER:
    This service validates operational metadata, temporal consistency, and formatting constraints
    supplied by the donor. It does NOT provide legal certifications, warranties, or liability
    guarantees regarding the actual physical or biological safety of the food items.
    """

    @staticmethod
    def validate_quantities(
        quantity_value: Decimal | float,
        total_weight_kg: Decimal | float,
    ) -> None:
        """Enforce strictly positive quantity and weight constraints."""
        if quantity_value <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity value must be strictly greater than zero",
            )
        if total_weight_kg <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Total weight in kg must be strictly greater than zero",
            )

    @staticmethod
    def validate_temporal_window(
        available_from: datetime,
        pickup_deadline: datetime,
        safe_consumption_deadline: datetime,
        preparation_time: Optional[datetime] = None,
    ) -> None:
        """
        Validate logical time sequencing for surplus food availability and food safety:
        1. pickup_deadline > available_from
        2. safe_consumption_deadline >= pickup_deadline
        3. If preparation_time is provided:
           - preparation_time <= available_from (or pickup_deadline)
           - safe_consumption_deadline > preparation_time
        """
        # Ensure timezone-aware comparisons (convert naive to UTC if encountered)
        if available_from.tzinfo is None:
            available_from = available_from.replace(tzinfo=timezone.utc)
        if pickup_deadline.tzinfo is None:
            pickup_deadline = pickup_deadline.replace(tzinfo=timezone.utc)
        if safe_consumption_deadline.tzinfo is None:
            safe_consumption_deadline = safe_consumption_deadline.replace(tzinfo=timezone.utc)

        if pickup_deadline <= available_from:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pickup deadline must be strictly after available_from time",
            )

        if safe_consumption_deadline < pickup_deadline:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Safe consumption deadline cannot be earlier than the pickup deadline",
            )

        if preparation_time:
            if preparation_time.tzinfo is None:
                preparation_time = preparation_time.replace(tzinfo=timezone.utc)

            if safe_consumption_deadline <= preparation_time:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Safe consumption deadline must be strictly after preparation time",
                )

            if preparation_time > pickup_deadline:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Preparation time cannot be after the pickup deadline",
                )
