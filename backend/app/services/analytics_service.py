from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID
from sqlalchemy import Date, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    DonationStatus,
    FoodCategory,
    MatchStatus,
    OrgVerificationStatus,
    PickupStatus,
    UserRole,
)
from app.models.match import DonationMatch
from app.models.organization import Organization
from app.models.pickup import Pickup
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    AnalyticsSummary,
    CategoryDistribution,
    MatchingAnalytics,
    TrendDataPoint,
)


class AnalyticsService:
    @staticmethod
    def parse_time_range(
        time_range: str = "30d",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> tuple[Optional[datetime], Optional[datetime], str]:
        """
        Parses time boundaries into UTC datetimes.
        """
        now = datetime.now(timezone.utc)
        if start_date or end_date:
            return start_date, end_date, "custom"

        norm_range = (time_range or "30d").lower()
        if norm_range == "7d":
            return now - timedelta(days=7), now, "7d"
        elif norm_range == "30d":
            return now - timedelta(days=30), now, "30d"
        elif norm_range == "90d":
            return now - timedelta(days=90), now, "90d"
        elif norm_range == "all":
            return None, None, "all"
        else:
            return now - timedelta(days=30), now, "30d"

    @classmethod
    async def get_overview(
        cls,
        db: AsyncSession,
        current_user: User,
        time_range: str = "30d",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> AnalyticsOverviewResponse:
        start_dt, end_dt, resolved_range = cls.parse_time_range(time_range, start_date, end_date)

        role = current_user.role

        if role == UserRole.FOOD_BUSINESS:
            return await cls._get_business_overview(db, current_user, resolved_range, start_dt, end_dt)
        elif role == UserRole.ORGANIZATION:
            return await cls._get_organization_overview(db, current_user, resolved_range, start_dt, end_dt)
        elif role == UserRole.VOLUNTEER:
            return await cls._get_volunteer_overview(db, current_user, resolved_range, start_dt, end_dt)
        elif role == UserRole.ADMIN:
            return await cls._get_admin_overview(db, current_user, resolved_range, start_dt, end_dt)
        else:
            return AnalyticsOverviewResponse(
                role=role.value,
                time_range=resolved_range,
                summary=AnalyticsSummary(),
                matching=MatchingAnalytics(),
                categories=[],
                trends=[],
                role_metrics={},
            )

    @classmethod
    async def _get_admin_overview(
        cls,
        db: AsyncSession,
        current_user: User,
        time_range: str,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> AnalyticsOverviewResponse:
        # 1. Platform counts
        user_counts = await db.execute(
            select(
                func.count(User.id).label("total_users"),
                func.count(FoodBusiness.id).label("total_businesses"),
                func.count(Organization.id).label("total_orgs"),
                func.count(Organization.id).filter(Organization.verification_status == OrgVerificationStatus.VERIFIED).label("verified_orgs"),
                func.count(Volunteer.id).label("total_volunteers"),
                func.count(Volunteer.id).filter(Volunteer.is_available.is_(True)).label("active_volunteers"),
            ).select_from(User)
            .outerjoin(FoodBusiness, FoodBusiness.user_id == User.id)
            .outerjoin(Organization, Organization.user_id == User.id)
            .outerjoin(Volunteer, Volunteer.user_id == User.id)
        )
        u_row = user_counts.one()

        role_metrics = {
            "total_users": int(u_row.total_users or 0),
            "total_food_businesses": int(u_row.total_businesses or 0),
            "total_organizations": int(u_row.total_orgs or 0),
            "verified_organizations": int(u_row.verified_orgs or 0),
            "total_volunteers": int(u_row.total_volunteers or 0),
            "active_volunteers": int(u_row.active_volunteers or 0),
        }

        # 2. Donation conditions
        donation_filter = []
        if start_dt:
            donation_filter.append(Donation.created_at >= start_dt)
        if end_dt:
            donation_filter.append(Donation.created_at <= end_dt)

        summary_stmt = select(
            func.count(Donation.id).label("total_donations"),
            func.count(Donation.id).filter(
                Donation.status.in_([
                    DonationStatus.CREATED,
                    DonationStatus.MATCHED,
                    DonationStatus.ACCEPTED,
                    DonationStatus.PICKUP_ASSIGNED,
                    DonationStatus.IN_TRANSIT,
                ])
            ).label("active_donations"),
            func.count(Donation.id).filter(Donation.status == DonationStatus.DELIVERED).label("delivered_donations"),
            func.count(Donation.id).filter(Donation.status == DonationStatus.CANCELLED).label("cancelled_donations"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("total_weight_kg_donated"),
            func.coalesce(
                func.sum(case((Donation.status == DonationStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("total_weight_kg_delivered"),
        )
        if donation_filter:
            summary_stmt = summary_stmt.where(and_(*donation_filter))
        d_res = await db.execute(summary_stmt)
        d_row = d_res.one()

        # 3. Pickup conditions
        pickup_filter = []
        if start_dt:
            pickup_filter.append(Pickup.created_at >= start_dt)
        if end_dt:
            pickup_filter.append(Pickup.created_at <= end_dt)

        p_stmt = select(
            func.count(Pickup.id).label("total_pickups"),
            func.count(Pickup.id).filter(
                Pickup.status.in_([
                    PickupStatus.ASSIGNED,
                    PickupStatus.EN_ROUTE_TO_PICKUP,
                    PickupStatus.ARRIVED_AT_PICKUP,
                    PickupStatus.IN_TRANSIT,
                ])
            ).label("active_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.DELIVERED).label("delivered_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.FAILED).label("failed_pickups"),
        )
        if pickup_filter:
            p_stmt = p_stmt.where(and_(*pickup_filter))
        p_res = await db.execute(p_stmt)
        p_row = p_res.one()

        summary = AnalyticsSummary(
            total_donations=int(d_row.total_donations or 0),
            active_donations=int(d_row.active_donations or 0),
            delivered_donations=int(d_row.delivered_donations or 0),
            cancelled_donations=int(d_row.cancelled_donations or 0),
            total_weight_kg_donated=float(d_row.total_weight_kg_donated or 0.0),
            total_weight_kg_delivered=float(d_row.total_weight_kg_delivered or 0.0),
            total_pickups=int(p_row.total_pickups or 0),
            active_pickups=int(p_row.active_pickups or 0),
            delivered_pickups=int(p_row.delivered_pickups or 0),
            failed_pickups=int(p_row.failed_pickups or 0),
        )

        # 4. Matching analytics
        match_filter = []
        if start_dt:
            match_filter.append(DonationMatch.created_at >= start_dt)
        if end_dt:
            match_filter.append(DonationMatch.created_at <= end_dt)

        m_stmt = select(
            func.count(DonationMatch.id).label("total_matches"),
            func.count(DonationMatch.id).filter(DonationMatch.status == MatchStatus.ACCEPTED).label("accepted_matches"),
            func.count(DonationMatch.id).filter(DonationMatch.status == MatchStatus.DECLINED).label("declined_matches"),
            func.coalesce(func.avg(DonationMatch.distance_meters), 0.0).label("avg_dist_meters"),
            func.coalesce(func.avg(DonationMatch.score), 0.0).label("avg_score"),
        )
        if match_filter:
            m_stmt = m_stmt.where(and_(*match_filter))
        m_res = await db.execute(m_stmt)
        m_row = m_res.one()

        tot_m = int(m_row.total_matches or 0)
        acc_m = int(m_row.accepted_matches or 0)
        dec_m = int(m_row.declined_matches or 0)
        resp_m = acc_m + dec_m
        acceptance_rate = round((acc_m / resp_m * 100.0), 1) if resp_m > 0 else 0.0

        matching = MatchingAnalytics(
            total_matches=tot_m,
            accepted_matches=acc_m,
            declined_matches=dec_m,
            acceptance_rate=acceptance_rate,
            avg_distance_km=round(float(m_row.avg_dist_meters or 0.0) / 1000.0, 2),
            avg_match_score=round(float(m_row.avg_score or 0.0), 1),
        )

        # 5. Categories
        cat_stmt = select(
            Donation.food_category,
            func.count(Donation.id).label("count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight"),
        )
        if donation_filter:
            cat_stmt = cat_stmt.where(and_(*donation_filter))
        cat_stmt = cat_stmt.group_by(Donation.food_category).order_by(func.sum(Donation.total_weight_kg).desc())
        cat_res = await db.execute(cat_stmt)
        categories = [
            CategoryDistribution(
                category=row[0].value if hasattr(row[0], "value") else str(row[0]),
                count=int(row[1] or 0),
                total_weight_kg=float(row[2] or 0.0),
            )
            for row in cat_res.all()
        ]

        # 6. Trends
        trends = await cls._compute_trends(db, donation_filter, None)

        return AnalyticsOverviewResponse(
            role=current_user.role.value,
            time_range=time_range,
            summary=summary,
            matching=matching,
            categories=categories,
            trends=trends,
            role_metrics=role_metrics,
        )

    @classmethod
    async def _get_business_overview(
        cls,
        db: AsyncSession,
        current_user: User,
        time_range: str,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> AnalyticsOverviewResponse:
        biz_res = await db.execute(select(FoodBusiness).where(FoodBusiness.user_id == current_user.id))
        biz = biz_res.scalar_one_or_none()
        if not biz:
            return AnalyticsOverviewResponse(
                role=current_user.role.value,
                time_range=time_range,
                summary=AnalyticsSummary(),
                matching=MatchingAnalytics(),
                categories=[],
                trends=[],
                role_metrics={"business_name": "Unregistered", "business_type": "None"},
            )

        donation_filter = [Donation.business_id == biz.id]
        if start_dt:
            donation_filter.append(Donation.created_at >= start_dt)
        if end_dt:
            donation_filter.append(Donation.created_at <= end_dt)

        summary_stmt = select(
            func.count(Donation.id).label("total_donations"),
            func.count(Donation.id).filter(
                Donation.status.in_([
                    DonationStatus.CREATED,
                    DonationStatus.MATCHED,
                    DonationStatus.ACCEPTED,
                    DonationStatus.PICKUP_ASSIGNED,
                    DonationStatus.IN_TRANSIT,
                ])
            ).label("active_donations"),
            func.count(Donation.id).filter(Donation.status == DonationStatus.DELIVERED).label("delivered_donations"),
            func.count(Donation.id).filter(Donation.status == DonationStatus.CANCELLED).label("cancelled_donations"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("total_weight_kg_donated"),
            func.coalesce(
                func.sum(case((Donation.status == DonationStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("total_weight_kg_delivered"),
        ).where(and_(*donation_filter))
        d_res = await db.execute(summary_stmt)
        d_row = d_res.one()

        # Pickups for this business's donations
        p_stmt = select(
            func.count(Pickup.id).label("total_pickups"),
            func.count(Pickup.id).filter(
                Pickup.status.in_([
                    PickupStatus.ASSIGNED,
                    PickupStatus.EN_ROUTE_TO_PICKUP,
                    PickupStatus.ARRIVED_AT_PICKUP,
                    PickupStatus.IN_TRANSIT,
                ])
            ).label("active_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.DELIVERED).label("delivered_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.FAILED).label("failed_pickups"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(Donation.business_id == biz.id)
        if start_dt:
            p_stmt = p_stmt.where(Pickup.created_at >= start_dt)
        if end_dt:
            p_stmt = p_stmt.where(Pickup.created_at <= end_dt)
        p_res = await db.execute(p_stmt)
        p_row = p_res.one()

        summary = AnalyticsSummary(
            total_donations=int(d_row.total_donations or 0),
            active_donations=int(d_row.active_donations or 0),
            delivered_donations=int(d_row.delivered_donations or 0),
            cancelled_donations=int(d_row.cancelled_donations or 0),
            total_weight_kg_donated=float(d_row.total_weight_kg_donated or 0.0),
            total_weight_kg_delivered=float(d_row.total_weight_kg_delivered or 0.0),
            total_pickups=int(p_row.total_pickups or 0),
            active_pickups=int(p_row.active_pickups or 0),
            delivered_pickups=int(p_row.delivered_pickups or 0),
            failed_pickups=int(p_row.failed_pickups or 0),
        )

        # Matches on business donations
        m_stmt = select(
            func.count(DonationMatch.id).label("total_matches"),
            func.count(DonationMatch.id).filter(DonationMatch.status == MatchStatus.ACCEPTED).label("accepted_matches"),
            func.count(DonationMatch.id).filter(DonationMatch.status == MatchStatus.DECLINED).label("declined_matches"),
            func.coalesce(func.avg(DonationMatch.distance_meters), 0.0).label("avg_dist_meters"),
            func.coalesce(func.avg(DonationMatch.score), 0.0).label("avg_score"),
        ).select_from(DonationMatch).join(Donation, Donation.id == DonationMatch.donation_id).where(Donation.business_id == biz.id)
        if start_dt:
            m_stmt = m_stmt.where(DonationMatch.created_at >= start_dt)
        if end_dt:
            m_stmt = m_stmt.where(DonationMatch.created_at <= end_dt)
        m_res = await db.execute(m_stmt)
        m_row = m_res.one()

        tot_m = int(m_row.total_matches or 0)
        acc_m = int(m_row.accepted_matches or 0)
        dec_m = int(m_row.declined_matches or 0)
        resp_m = acc_m + dec_m
        acceptance_rate = round((acc_m / resp_m * 100.0), 1) if resp_m > 0 else 0.0

        matching = MatchingAnalytics(
            total_matches=tot_m,
            accepted_matches=acc_m,
            declined_matches=dec_m,
            acceptance_rate=acceptance_rate,
            avg_distance_km=round(float(m_row.avg_dist_meters or 0.0) / 1000.0, 2),
            avg_match_score=round(float(m_row.avg_score or 0.0), 1),
        )

        # Categories
        cat_stmt = select(
            Donation.food_category,
            func.count(Donation.id).label("count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight"),
        ).where(and_(*donation_filter)).group_by(Donation.food_category).order_by(func.sum(Donation.total_weight_kg).desc())
        cat_res = await db.execute(cat_stmt)
        categories = [
            CategoryDistribution(
                category=row[0].value if hasattr(row[0], "value") else str(row[0]),
                count=int(row[1] or 0),
                total_weight_kg=float(row[2] or 0.0),
            )
            for row in cat_res.all()
        ]

        trends = await cls._compute_trends(db, donation_filter, None)

        role_metrics = {
            "business_name": biz.business_name,
            "business_type": biz.business_type.value,
            "completed_deliveries_count": int(d_row.delivered_donations or 0),
        }

        return AnalyticsOverviewResponse(
            role=current_user.role.value,
            time_range=time_range,
            summary=summary,
            matching=matching,
            categories=categories,
            trends=trends,
            role_metrics=role_metrics,
        )

    @classmethod
    async def _get_organization_overview(
        cls,
        db: AsyncSession,
        current_user: User,
        time_range: str,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> AnalyticsOverviewResponse:
        org_res = await db.execute(select(Organization).where(Organization.user_id == current_user.id))
        org = org_res.scalar_one_or_none()
        if not org:
            return AnalyticsOverviewResponse(
                role=current_user.role.value,
                time_range=time_range,
                summary=AnalyticsSummary(),
                matching=MatchingAnalytics(),
                categories=[],
                trends=[],
                role_metrics={"org_name": "Unregistered", "org_type": "None"},
            )

        # Pickups for this organization
        p_filter = [Pickup.organization_id == org.id]
        if start_dt:
            p_filter.append(Pickup.created_at >= start_dt)
        if end_dt:
            p_filter.append(Pickup.created_at <= end_dt)

        p_stmt = select(
            func.count(Pickup.id).label("total_pickups"),
            func.count(Pickup.id).filter(
                Pickup.status.in_([
                    PickupStatus.ASSIGNED,
                    PickupStatus.EN_ROUTE_TO_PICKUP,
                    PickupStatus.ARRIVED_AT_PICKUP,
                    PickupStatus.IN_TRANSIT,
                ])
            ).label("active_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.DELIVERED).label("delivered_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.FAILED).label("failed_pickups"),
        ).where(and_(*p_filter))
        p_res = await db.execute(p_stmt)
        p_row = p_res.one()

        # Delivered weight for this org's pickups
        pw_stmt = select(
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight_donated"),
            func.coalesce(
                func.sum(case((Pickup.status == PickupStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("weight_delivered"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(Pickup.organization_id == org.id)
        if start_dt:
            pw_stmt = pw_stmt.where(Pickup.created_at >= start_dt)
        if end_dt:
            pw_stmt = pw_stmt.where(Pickup.created_at <= end_dt)
        pw_res = await db.execute(pw_stmt)
        pw_row = pw_res.one()

        summary = AnalyticsSummary(
            total_donations=int(p_row.total_pickups or 0),
            active_donations=int(p_row.active_pickups or 0),
            delivered_donations=int(p_row.delivered_pickups or 0),
            cancelled_donations=0,
            total_weight_kg_donated=float(pw_row.weight_donated or 0.0),
            total_weight_kg_delivered=float(pw_row.weight_delivered or 0.0),
            total_pickups=int(p_row.total_pickups or 0),
            active_pickups=int(p_row.active_pickups or 0),
            delivered_pickups=int(p_row.delivered_pickups or 0),
            failed_pickups=int(p_row.failed_pickups or 0),
        )

        # Matches for this organization
        m_filter = [DonationMatch.organization_id == org.id]
        if start_dt:
            m_filter.append(DonationMatch.created_at >= start_dt)
        if end_dt:
            m_filter.append(DonationMatch.created_at <= end_dt)

        m_stmt = select(
            func.count(DonationMatch.id).label("total_matches"),
            func.count(DonationMatch.id).filter(DonationMatch.status == MatchStatus.ACCEPTED).label("accepted_matches"),
            func.count(DonationMatch.id).filter(DonationMatch.status == MatchStatus.DECLINED).label("declined_matches"),
            func.coalesce(func.avg(DonationMatch.distance_meters), 0.0).label("avg_dist_meters"),
            func.coalesce(func.avg(DonationMatch.score), 0.0).label("avg_score"),
        ).where(and_(*m_filter))
        m_res = await db.execute(m_stmt)
        m_row = m_res.one()

        tot_m = int(m_row.total_matches or 0)
        acc_m = int(m_row.accepted_matches or 0)
        dec_m = int(m_row.declined_matches or 0)
        resp_m = acc_m + dec_m
        acceptance_rate = round((acc_m / resp_m * 100.0), 1) if resp_m > 0 else 0.0

        matching = MatchingAnalytics(
            total_matches=tot_m,
            accepted_matches=acc_m,
            declined_matches=dec_m,
            acceptance_rate=acceptance_rate,
            avg_distance_km=round(float(m_row.avg_dist_meters or 0.0) / 1000.0, 2),
            avg_match_score=round(float(m_row.avg_score or 0.0), 1),
        )

        # Food categories received by this org
        cat_stmt = select(
            Donation.food_category,
            func.count(Pickup.id).label("count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(and_(*p_filter)).group_by(Donation.food_category).order_by(func.sum(Donation.total_weight_kg).desc())
        cat_res = await db.execute(cat_stmt)
        categories = [
            CategoryDistribution(
                category=row[0].value if hasattr(row[0], "value") else str(row[0]),
                count=int(row[1] or 0),
                total_weight_kg=float(row[2] or 0.0),
            )
            for row in cat_res.all()
        ]

        # Trends on organization pickups
        trends = await cls._compute_org_trends(db, org.id, start_dt, end_dt)

        max_cap = float(org.max_capacity_kg or 0.0)
        curr_cap = float(org.current_capacity_kg or 0.0)
        util_pct = round((curr_cap / max_cap * 100.0), 1) if max_cap > 0 else 0.0

        role_metrics = {
            "org_name": org.org_name,
            "org_type": org.org_type.value,
            "verification_status": org.verification_status.value,
            "max_capacity_kg": max_cap,
            "current_capacity_kg": curr_cap,
            "capacity_utilization_pct": util_pct,
        }

        return AnalyticsOverviewResponse(
            role=current_user.role.value,
            time_range=time_range,
            summary=summary,
            matching=matching,
            categories=categories,
            trends=trends,
            role_metrics=role_metrics,
        )

    @classmethod
    async def _get_volunteer_overview(
        cls,
        db: AsyncSession,
        current_user: User,
        time_range: str,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> AnalyticsOverviewResponse:
        vol_res = await db.execute(select(Volunteer).where(Volunteer.user_id == current_user.id))
        vol = vol_res.scalar_one_or_none()
        if not vol:
            return AnalyticsOverviewResponse(
                role=current_user.role.value,
                time_range=time_range,
                summary=AnalyticsSummary(),
                matching=MatchingAnalytics(),
                categories=[],
                trends=[],
                role_metrics={"full_name": "Unregistered", "is_available": False},
            )

        p_filter = [Pickup.volunteer_id == vol.id]
        if start_dt:
            p_filter.append(Pickup.created_at >= start_dt)
        if end_dt:
            p_filter.append(Pickup.created_at <= end_dt)

        p_stmt = select(
            func.count(Pickup.id).label("total_pickups"),
            func.count(Pickup.id).filter(
                Pickup.status.in_([
                    PickupStatus.ASSIGNED,
                    PickupStatus.EN_ROUTE_TO_PICKUP,
                    PickupStatus.ARRIVED_AT_PICKUP,
                    PickupStatus.IN_TRANSIT,
                ])
            ).label("active_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.DELIVERED).label("delivered_pickups"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.FAILED).label("failed_pickups"),
        ).where(and_(*p_filter))
        p_res = await db.execute(p_stmt)
        p_row = p_res.one()

        # Weight handled by volunteer
        pw_stmt = select(
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight_handled"),
            func.coalesce(
                func.sum(case((Pickup.status == PickupStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("weight_delivered"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(Pickup.volunteer_id == vol.id)
        if start_dt:
            pw_stmt = pw_stmt.where(Pickup.created_at >= start_dt)
        if end_dt:
            pw_stmt = pw_stmt.where(Pickup.created_at <= end_dt)
        pw_res = await db.execute(pw_stmt)
        pw_row = pw_res.one()

        del_p = int(p_row.delivered_pickups or 0)
        tot_p = int(p_row.total_pickups or 0)
        completion_rate = round((del_p / tot_p * 100.0), 1) if tot_p > 0 else 0.0

        summary = AnalyticsSummary(
            total_donations=tot_p,
            active_donations=int(p_row.active_pickups or 0),
            delivered_donations=del_p,
            cancelled_donations=0,
            total_weight_kg_donated=float(pw_row.weight_handled or 0.0),
            total_weight_kg_delivered=float(pw_row.weight_delivered or 0.0),
            total_pickups=tot_p,
            active_pickups=int(p_row.active_pickups or 0),
            delivered_pickups=del_p,
            failed_pickups=int(p_row.failed_pickups or 0),
        )

        matching = MatchingAnalytics(
            total_matches=0,
            accepted_matches=0,
            declined_matches=0,
            acceptance_rate=completion_rate, # Reuse for volunteer completion rate
            avg_distance_km=0.0,
            avg_match_score=0.0,
        )

        # Categories handled by volunteer
        cat_stmt = select(
            Donation.food_category,
            func.count(Pickup.id).label("count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(and_(*p_filter)).group_by(Donation.food_category).order_by(func.sum(Donation.total_weight_kg).desc())
        cat_res = await db.execute(cat_stmt)
        categories = [
            CategoryDistribution(
                category=row[0].value if hasattr(row[0], "value") else str(row[0]),
                count=int(row[1] or 0),
                total_weight_kg=float(row[2] or 0.0),
            )
            for row in cat_res.all()
        ]

        # Trends on volunteer pickups
        trends = await cls._compute_volunteer_trends(db, vol.id, start_dt, end_dt)

        role_metrics = {
            "full_name": vol.full_name,
            "vehicle_type": vol.vehicle_type.value,
            "is_available": vol.is_available,
            "service_radius_km": float(vol.service_radius_km or 0.0),
            "has_insulated_bags": vol.has_insulated_bags,
            "completion_rate_pct": completion_rate,
        }

        return AnalyticsOverviewResponse(
            role=current_user.role.value,
            time_range=time_range,
            summary=summary,
            matching=matching,
            categories=categories,
            trends=trends,
            role_metrics=role_metrics,
        )

    @staticmethod
    async def _compute_trends(
        db: AsyncSession,
        donation_filters: List[Any],
        pickup_filters: Optional[List[Any]] = None,
    ) -> List[TrendDataPoint]:
        """
        Groups donations and deliveries by calendar day.
        """
        day_col = cast(Donation.created_at, Date)
        stmt = select(
            day_col.label("date"),
            func.count(Donation.id).label("donations_count"),
            func.count(Donation.id).filter(Donation.status == DonationStatus.DELIVERED).label("delivered_count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight_donated"),
            func.coalesce(
                func.sum(case((Donation.status == DonationStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("weight_delivered"),
        )
        if donation_filters:
            stmt = stmt.where(and_(*donation_filters))
        stmt = stmt.group_by(day_col).order_by(day_col.asc())

        res = await db.execute(stmt)
        trends: List[TrendDataPoint] = []
        for row in res.all():
            d_str = row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
            trends.append(
                TrendDataPoint(
                    date=d_str,
                    donations_count=int(row[1] or 0),
                    delivered_count=int(row[2] or 0),
                    weight_kg_donated=float(row[3] or 0.0),
                    weight_kg_delivered=float(row[4] or 0.0),
                )
            )
        return trends

    @staticmethod
    async def _compute_org_trends(
        db: AsyncSession,
        org_id: UUID,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> List[TrendDataPoint]:
        day_col = cast(Pickup.created_at, Date)
        stmt = select(
            day_col.label("date"),
            func.count(Pickup.id).label("total_count"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.DELIVERED).label("delivered_count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight_donated"),
            func.coalesce(
                func.sum(case((Pickup.status == PickupStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("weight_delivered"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(Pickup.organization_id == org_id)

        if start_dt:
            stmt = stmt.where(Pickup.created_at >= start_dt)
        if end_dt:
            stmt = stmt.where(Pickup.created_at <= end_dt)

        stmt = stmt.group_by(day_col).order_by(day_col.asc())
        res = await db.execute(stmt)
        trends: List[TrendDataPoint] = []
        for row in res.all():
            d_str = row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
            trends.append(
                TrendDataPoint(
                    date=d_str,
                    donations_count=int(row[1] or 0),
                    delivered_count=int(row[2] or 0),
                    weight_kg_donated=float(row[3] or 0.0),
                    weight_kg_delivered=float(row[4] or 0.0),
                )
            )
        return trends

    @staticmethod
    async def _compute_volunteer_trends(
        db: AsyncSession,
        volunteer_id: UUID,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> List[TrendDataPoint]:
        day_col = cast(Pickup.created_at, Date)
        stmt = select(
            day_col.label("date"),
            func.count(Pickup.id).label("total_count"),
            func.count(Pickup.id).filter(Pickup.status == PickupStatus.DELIVERED).label("delivered_count"),
            func.coalesce(func.sum(Donation.total_weight_kg), 0.0).label("weight_donated"),
            func.coalesce(
                func.sum(case((Pickup.status == PickupStatus.DELIVERED, Donation.total_weight_kg), else_=0.0)),
                0.0
            ).label("weight_delivered"),
        ).select_from(Pickup).join(Donation, Donation.id == Pickup.donation_id).where(Pickup.volunteer_id == volunteer_id)

        if start_dt:
            stmt = stmt.where(Pickup.created_at >= start_dt)
        if end_dt:
            stmt = stmt.where(Pickup.created_at <= end_dt)

        stmt = stmt.group_by(day_col).order_by(day_col.asc())
        res = await db.execute(stmt)
        trends: List[TrendDataPoint] = []
        for row in res.all():
            d_str = row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
            trends.append(
                TrendDataPoint(
                    date=d_str,
                    donations_count=int(row[1] or 0),
                    delivered_count=int(row[2] or 0),
                    weight_kg_donated=float(row[3] or 0.0),
                    weight_kg_delivered=float(row[4] or 0.0),
                )
            )
        return trends
