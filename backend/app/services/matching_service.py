from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import DonationStatus, OrgVerificationStatus, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.match import CandidateMatchResponse, DonationMatchListResponse
from app.services.business_service import BusinessService
from app.services.donation_service import DonationService

INELIGIBLE_DONATION_STATUSES = {
    DonationStatus.CANCELLED,
    DonationStatus.DELIVERED,
    DonationStatus.EXPIRED,
    DonationStatus.FAILED_DELIVERY,
}


class MatchingService:
    """
    Deterministic geospatial matching engine for surplus food donations.

    Matches eligible active donations against verified recipient organizations
    satisfying hard constraints (spatial radius, food category, capacity)
    and produces deterministic scoring and ranking.
    """

    @staticmethod
    def calculate_candidate_score(
        distance_meters: float,
        max_radius_meters: float,
        donation_weight_kg: float,
        available_capacity_kg: float,
        can_pickup: bool,
    ) -> float:
        """
        Calculate a normalized, deterministic matching score between 0.0 and 100.0.

        Weights:
        - Distance / Proximity: 50% (closer = higher score)
        - Capacity Headroom: 30% (ample capacity = higher score)
        - Logistics Readiness: 20% (direct pickup capability = higher score)
        """
        # 1. Proximity Score (0.0 to 1.0)
        s_dist = max(0.0, min(1.0, 1.0 - (distance_meters / max_radius_meters))) if max_radius_meters > 0 else 1.0

        # 2. Capacity Score (0.5 to 1.0 for valid headroom >= weight)
        if available_capacity_kg >= (2.0 * donation_weight_kg):
            s_cap = 1.0
        elif donation_weight_kg > 0 and available_capacity_kg >= donation_weight_kg:
            s_cap = 0.5 + 0.5 * ((available_capacity_kg - donation_weight_kg) / donation_weight_kg)
        else:
            s_cap = 0.0

        # 3. Logistics Readiness Score (0.5 to 1.0)
        s_logistics = 1.0 if can_pickup else 0.5

        # Weighted composite score
        composite = (0.50 * s_dist) + (0.30 * s_cap) + (0.20 * s_logistics)
        return round(composite * 100.0, 2)

    @staticmethod
    def build_match_reasons(
        org: Organization,
        donation: Donation,
        distance_km: float,
        max_radius_km: float,
        available_capacity_kg: float,
    ) -> List[str]:
        """Generate structured, rule-based explanations for candidate suitability."""
        reasons = [
            "verified_organization",
            f"food_category_accepted: {donation.food_category.value}",
            f"sufficient_capacity: {available_capacity_kg:.1f}kg available >= {float(donation.total_weight_kg):.1f}kg donation",
            f"within_search_radius: {distance_km:.2f}km <= {max_radius_km:.1f}km",
        ]
        if org.can_pickup:
            reasons.append("direct_pickup_capable")
        else:
            reasons.append("requires_volunteer_courier")
        return reasons

    @staticmethod
    async def find_matches_for_donation(
        db: AsyncSession,
        user: User,
        donation_id: UUID,
        max_radius_km: float = 25.0,
    ) -> DonationMatchListResponse:
        """
        Find, rank, and explain candidate recipient organizations for a given donation.
        Enforces strict ownership, active donation status, and database-side PostGIS filtering.
        """
        donation = await DonationService.get_donation_by_id(db, donation_id)
        if not donation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Donation not found.",
            )

        # Enforce ownership: Donor kitchen can only query matches for their own donations
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
                detail="Only the donation owner or an administrator can view candidate matches.",
            )

        # Validate donation lifecycle eligibility
        if donation.status in INELIGIBLE_DONATION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Donation is not eligible for matching (status: {donation.status.value}).",
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

        max_radius_meters = max_radius_km * 1000.0
        distance_expr = func.ST_Distance(Organization.location, donation.location)
        avail_capacity_expr = Organization.max_capacity_kg - Organization.current_capacity_kg

        # Database-side PostGIS query with all hard constraints applied in SQL
        stmt = (
            select(
                Organization,
                distance_expr.label("distance_meters"),
            )
            .where(
                Organization.verification_status == OrgVerificationStatus.VERIFIED,
                func.ST_DWithin(Organization.location, donation.location, max_radius_meters),
                Organization.accepted_categories.contains([donation.food_category.value]),
                avail_capacity_expr >= float(donation.total_weight_kg),
            )
        )

        result = await db.execute(stmt)
        candidates_raw: List[Tuple[Organization, float]] = result.all()

        evaluated_candidates = []
        for org, dist_m in candidates_raw:
            dist_meters = float(dist_m)
            dist_km = dist_meters / 1000.0
            avail_cap = float(org.max_capacity_kg) - float(org.current_capacity_kg)

            score = MatchingService.calculate_candidate_score(
                distance_meters=dist_meters,
                max_radius_meters=max_radius_meters,
                donation_weight_kg=float(donation.total_weight_kg),
                available_capacity_kg=avail_cap,
                can_pickup=org.can_pickup,
            )

            reasons = MatchingService.build_match_reasons(
                org=org,
                donation=donation,
                distance_km=dist_km,
                max_radius_km=max_radius_km,
                available_capacity_kg=avail_cap,
            )

            evaluated_candidates.append({
                "organization_id": org.id,
                "org_name": org.org_name,
                "org_type": org.org_type.value,
                "distance_km": round(dist_km, 2),
                "distance_meters": round(dist_meters, 2),
                "available_capacity_kg": round(avail_cap, 2),
                "max_capacity_kg": round(float(org.max_capacity_kg), 2),
                "current_capacity_kg": round(float(org.current_capacity_kg), 2),
                "score": score,
                "match_reasons": reasons,
            })

        # Deterministic sorting: score DESC, distance_meters ASC, organization_id ASC
        evaluated_candidates.sort(
            key=lambda c: (-c["score"], c["distance_meters"], str(c["organization_id"]))
        )

        # Assign deterministic 1-based ranks
        ranked_matches = []
        for rank_idx, cand in enumerate(evaluated_candidates, start=1):
            ranked_matches.append(
                CandidateMatchResponse(
                    organization_id=cand["organization_id"],
                    org_name=cand["org_name"],
                    org_type=cand["org_type"],
                    distance_km=cand["distance_km"],
                    distance_meters=cand["distance_meters"],
                    available_capacity_kg=cand["available_capacity_kg"],
                    max_capacity_kg=cand["max_capacity_kg"],
                    current_capacity_kg=cand["current_capacity_kg"],
                    score=cand["score"],
                    rank=rank_idx,
                    match_reasons=cand["match_reasons"],
                )
            )

        return DonationMatchListResponse(
            donation_id=donation.id,
            total_candidates_found=len(ranked_matches),
            matches=ranked_matches,
        )
