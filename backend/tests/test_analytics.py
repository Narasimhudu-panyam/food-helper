from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_current_active_user, get_current_user
from app.core.database import get_async_db
from app.main import app
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    BusinessType,
    DonationStatus,
    FoodCategory,
    MatchStatus,
    OrgType,
    OrgVerificationStatus,
    PickupStatus,
    QuantityUnit,
    StorageCondition,
    TransportMode,
    UserRole,
    VehicleType,
)
from app.models.match import DonationMatch
from app.models.organization import Organization
from app.models.pickup import Pickup
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.analytics import AnalyticsOverviewResponse
from app.services.analytics_service import AnalyticsService


# ==========================================
# 1. Time Range Parsing Unit Tests
# ==========================================

def test_parse_time_range():
    start, end, label = AnalyticsService.parse_time_range("7d")
    assert label == "7d"
    assert start is not None
    assert end is not None
    assert (end - start).days in (7, 8)

    start_all, end_all, label_all = AnalyticsService.parse_time_range("all")
    assert label_all == "all"
    assert start_all is None
    assert end_all is None

    custom_start = datetime.now(timezone.utc) - timedelta(days=15)
    custom_end = datetime.now(timezone.utc)
    s, e, l = AnalyticsService.parse_time_range("custom", start_date=custom_start, end_date=custom_end)
    assert l == "custom"
    assert s == custom_start
    assert e == custom_end


# ==========================================
# 2. Service Unit Tests & Tenant Scoping
# ==========================================

@pytest.mark.asyncio
async def test_admin_analytics_service_mocked():
    db = AsyncMock()

    # Mock user counts row
    mock_u_row = MagicMock()
    mock_u_row.total_users = 10
    mock_u_row.total_businesses = 3
    mock_u_row.total_orgs = 4
    mock_u_row.verified_orgs = 2
    mock_u_row.total_volunteers = 3
    mock_u_row.active_volunteers = 2

    # Mock donations row
    mock_d_row = MagicMock()
    mock_d_row.total_donations = 25
    mock_d_row.active_donations = 5
    mock_d_row.delivered_donations = 18
    mock_d_row.cancelled_donations = 2
    mock_d_row.total_weight_kg_donated = 350.5
    mock_d_row.total_weight_kg_delivered = 280.0

    # Mock pickups row
    mock_p_row = MagicMock()
    mock_p_row.total_pickups = 20
    mock_p_row.active_pickups = 2
    mock_p_row.delivered_pickups = 18
    mock_p_row.failed_pickups = 0

    # Mock matches row
    mock_m_row = MagicMock()
    mock_m_row.total_matches = 30
    mock_m_row.accepted_matches = 20
    mock_m_row.declined_matches = 5
    mock_m_row.avg_dist_meters = 4500.0
    mock_m_row.avg_score = 88.5

    # Mock categories
    mock_cats = [
        (FoodCategory.BAKERY, 15, 180.0),
        (FoodCategory.PREPARED_MEALS, 10, 170.5),
    ]

    # Mock trends
    now_date = datetime.now(timezone.utc).date()
    mock_trends = [
        (now_date, 5, 4, 70.0, 60.0)
    ]

    # Setup execute sequence
    db.execute.side_effect = [
        MagicMock(one=lambda: mock_u_row),
        MagicMock(one=lambda: mock_d_row),
        MagicMock(one=lambda: mock_p_row),
        MagicMock(one=lambda: mock_m_row),
        MagicMock(all=lambda: mock_cats),
        MagicMock(all=lambda: mock_trends),
    ]

    admin_user = User(
        id=uuid4(),
        email="admin@rescue.local",
        role=UserRole.ADMIN,
        is_active=True,
    )

    resp = await AnalyticsService.get_overview(db, admin_user, time_range="30d")

    assert resp.role == "ADMIN"
    assert resp.time_range == "30d"
    assert resp.summary.total_donations == 25
    assert resp.summary.delivered_donations == 18
    assert resp.summary.total_weight_kg_donated == 350.5
    assert resp.summary.total_weight_kg_delivered == 280.0
    assert resp.matching.total_matches == 30
    assert resp.matching.acceptance_rate == 80.0 # 20 / (20 + 5) * 100 = 80.0%
    assert resp.matching.avg_distance_km == 4.5
    assert resp.role_metrics["total_users"] == 10
    assert resp.role_metrics["verified_organizations"] == 2
    assert len(resp.categories) == 2
    assert len(resp.trends) == 1


# ==========================================
# 3. API Route Tests & End-to-End Auth
# ==========================================

@pytest.mark.asyncio
async def test_analytics_overview_api_unauthorized():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/overview")
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_analytics_overview_api_authorized_business():
    biz_user = User(
        id=uuid4(),
        email="bakery@biz.local",
        role=UserRole.FOOD_BUSINESS,
        is_active=True,
    )
    biz = FoodBusiness(
        id=uuid4(),
        user_id=biz_user.id,
        business_name="Artisan Bakery",
        business_type=BusinessType.BAKERY,
        address_text="123 Baker St",
        contact_phone="+1234567890",
    )

    mock_db = AsyncMock()
    # Mock business query
    mock_biz_res = MagicMock(scalar_one_or_none=lambda: biz)
    # Mock donation summary
    mock_d_row = MagicMock(
        total_donations=8,
        active_donations=2,
        delivered_donations=6,
        cancelled_donations=0,
        total_weight_kg_donated=45.0,
        total_weight_kg_delivered=35.0,
    )
    # Mock pickups
    mock_p_row = MagicMock(
        total_pickups=6,
        active_pickups=1,
        delivered_pickups=5,
        failed_pickups=0,
    )
    # Mock matches
    mock_m_row = MagicMock(
        total_matches=10,
        accepted_matches=6,
        declined_matches=2,
        avg_dist_meters=3200.0,
        avg_score=92.0,
    )
    # Mock categories
    mock_cats = [(FoodCategory.BAKERY, 8, 45.0)]
    # Mock trends
    mock_trends = [(datetime.now(timezone.utc).date(), 4, 3, 20.0, 15.0)]

    mock_db.execute.side_effect = [
        mock_biz_res,
        MagicMock(one=lambda: mock_d_row),
        MagicMock(one=lambda: mock_p_row),
        MagicMock(one=lambda: mock_m_row),
        MagicMock(all=lambda: mock_cats),
        MagicMock(all=lambda: mock_trends),
    ]

    app.dependency_overrides[get_current_active_user] = lambda: biz_user
    app.dependency_overrides[get_current_user] = lambda: biz_user
    app.dependency_overrides[get_async_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/analytics/overview?time_range=7d")
            assert response.status_code == 200
            data = response.json()
            assert data["role"] == "FOOD_BUSINESS"
            assert data["time_range"] == "7d"
            assert data["summary"]["total_donations"] == 8
            assert data["summary"]["total_weight_kg_donated"] == 45.0
            assert data["matching"]["acceptance_rate"] == 75.0 # 6 / (6 + 2) * 100
            assert data["role_metrics"]["business_name"] == "Artisan Bakery"
            assert len(data["categories"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_organization_analytics_service_mocked():
    db = AsyncMock()
    org_user = User(id=uuid4(), email="org@foodbank.local", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(
        id=uuid4(),
        user_id=org_user.id,
        org_name="Community Food Bank",
        org_type=OrgType.FOOD_BANK,
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=500.0,
        current_capacity_kg=150.0,
        address_text="456 Shelter Rd",
        contact_phone="+1987654321",
    )

    mock_p_row = MagicMock(
        total_pickups=12,
        active_pickups=2,
        delivered_pickups=10,
        failed_pickups=0,
    )
    mock_pw_row = MagicMock(
        weight_donated=240.0,
        weight_delivered=200.0,
    )
    mock_m_row = MagicMock(
        total_matches=15,
        accepted_matches=12,
        declined_matches=3,
        avg_dist_meters=2100.0,
        avg_score=95.0,
    )
    mock_cats = [(FoodCategory.PRODUCE, 8, 150.0)]
    mock_trends = [(datetime.now(timezone.utc).date(), 3, 3, 50.0, 50.0)]

    db.execute.side_effect = [
        MagicMock(scalar_one_or_none=lambda: org),
        MagicMock(one=lambda: mock_p_row),
        MagicMock(one=lambda: mock_pw_row),
        MagicMock(one=lambda: mock_m_row),
        MagicMock(all=lambda: mock_cats),
        MagicMock(all=lambda: mock_trends),
    ]

    resp = await AnalyticsService.get_overview(db, org_user, time_range="30d")
    assert resp.role == "ORGANIZATION"
    assert resp.summary.delivered_pickups == 10
    assert resp.summary.total_weight_kg_delivered == 200.0
    assert resp.role_metrics["capacity_utilization_pct"] == 30.0 # 150 / 500 * 100 = 30.0%
    assert resp.matching.acceptance_rate == 80.0


@pytest.mark.asyncio
async def test_volunteer_analytics_service_mocked():
    db = AsyncMock()
    vol_user = User(id=uuid4(), email="vol@driver.local", role=UserRole.VOLUNTEER, is_active=True)
    vol = Volunteer(
        id=uuid4(),
        user_id=vol_user.id,
        full_name="Sam Driver",
        vehicle_type=VehicleType.CAR,
        is_available=True,
        service_radius_km=15.0,
        has_insulated_bags=True,
        contact_phone="+1122334455",
    )

    mock_p_row = MagicMock(
        total_pickups=10,
        active_pickups=1,
        delivered_pickups=9,
        failed_pickups=0,
    )
    mock_pw_row = MagicMock(
        weight_handled=150.0,
        weight_delivered=135.0,
    )
    mock_cats = [(FoodCategory.PREPARED_MEALS, 6, 90.0)]
    mock_trends = [(datetime.now(timezone.utc).date(), 2, 2, 30.0, 30.0)]

    db.execute.side_effect = [
        MagicMock(scalar_one_or_none=lambda: vol),
        MagicMock(one=lambda: mock_p_row),
        MagicMock(one=lambda: mock_pw_row),
        MagicMock(all=lambda: mock_cats),
        MagicMock(all=lambda: mock_trends),
    ]

    resp = await AnalyticsService.get_overview(db, vol_user, time_range="30d")
    assert resp.role == "VOLUNTEER"
    assert resp.summary.delivered_pickups == 9
    assert resp.summary.total_weight_kg_delivered == 135.0
    assert resp.role_metrics["completion_rate_pct"] == 90.0 # 9 / 10 * 100 = 90.0%

