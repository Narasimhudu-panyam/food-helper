from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException, status
from httpx import ASGITransport, AsyncClient
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.api.dependencies import get_current_user
from app.core.database import get_async_db
from app.main import app
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    BusinessType,
    DonationStatus,
    FoodCategory,
    OrgType,
    OrgVerificationStatus,
    QuantityUnit,
    StorageCondition,
    UserRole,
)
from app.models.organization import Organization
from app.models.user import User
from app.schemas.match import CandidateMatchResponse, DonationMatchListResponse
from app.services.matching_service import MatchingService


# ==========================================
# 1. Matching Algorithm & Scoring Unit Tests
# ==========================================

def test_scoring_normalization_and_weights():
    # 1. Proximity: Closer organization gets higher score
    score_close = MatchingService.calculate_candidate_score(
        distance_meters=1000.0,
        max_radius_meters=25000.0,
        donation_weight_kg=10.0,
        available_capacity_kg=50.0,
        can_pickup=True,
    )
    score_far = MatchingService.calculate_candidate_score(
        distance_meters=20000.0,
        max_radius_meters=25000.0,
        donation_weight_kg=10.0,
        available_capacity_kg=50.0,
        can_pickup=True,
    )
    assert score_close > score_far

    # 2. Logistics: Direct pickup capable gets higher score
    score_with_pickup = MatchingService.calculate_candidate_score(
        distance_meters=5000.0,
        max_radius_meters=25000.0,
        donation_weight_kg=10.0,
        available_capacity_kg=50.0,
        can_pickup=True,
    )
    score_no_pickup = MatchingService.calculate_candidate_score(
        distance_meters=5000.0,
        max_radius_meters=25000.0,
        donation_weight_kg=10.0,
        available_capacity_kg=50.0,
        can_pickup=False,
    )
    assert score_with_pickup > score_no_pickup

    # 3. Capacity: Boundary vs ample headroom
    score_ample_cap = MatchingService.calculate_candidate_score(
        distance_meters=5000.0,
        max_radius_meters=25000.0,
        donation_weight_kg=10.0,
        available_capacity_kg=25.0,  # > 2x donation weight
        can_pickup=True,
    )
    score_exact_cap = MatchingService.calculate_candidate_score(
        distance_meters=5000.0,
        max_radius_meters=25000.0,
        donation_weight_kg=10.0,
        available_capacity_kg=10.0,  # Exact boundary
        can_pickup=True,
    )
    assert score_ample_cap > score_exact_cap
    assert 0.0 <= score_exact_cap <= 100.0
    assert 0.0 <= score_ample_cap <= 100.0


def test_scoring_determinism():
    score1 = MatchingService.calculate_candidate_score(
        distance_meters=3450.0,
        max_radius_meters=25000.0,
        donation_weight_kg=15.0,
        available_capacity_kg=40.0,
        can_pickup=True,
    )
    score2 = MatchingService.calculate_candidate_score(
        distance_meters=3450.0,
        max_radius_meters=25000.0,
        donation_weight_kg=15.0,
        available_capacity_kg=40.0,
        can_pickup=True,
    )
    assert score1 == score2


def test_build_match_reasons():
    org = Organization(
        id=uuid4(),
        user_id=uuid4(),
        org_name="City Food Bank",
        org_type=OrgType.FOOD_BANK,
        address_text="456 Hope Street",
        contact_phone="+1-555-0200",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=200.0,
        current_capacity_kg=50.0,
        accepted_categories=["BAKERY", "PRODUCE"],
        can_pickup=True,
    )
    donation = Donation(
        id=uuid4(),
        business_id=uuid4(),
        title="Artisan Bread",
        food_category=FoodCategory.BAKERY,
        quantity_value=20.0,
        quantity_unit=QuantityUnit.ITEMS,
        total_weight_kg=10.0,
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        packaging_type="Boxes",
        pickup_deadline=datetime.now(timezone.utc) + timedelta(hours=4),
        safe_consumption_deadline=datetime.now(timezone.utc) + timedelta(hours=12),
        status=DonationStatus.CREATED,
    )

    reasons = MatchingService.build_match_reasons(
        org=org,
        donation=donation,
        distance_km=3.5,
        max_radius_km=25.0,
        available_capacity_kg=150.0,
    )
    assert "verified_organization" in reasons
    assert "food_category_accepted: BAKERY" in reasons
    assert "direct_pickup_capable" in reasons
    assert any("150.0kg available" in r for r in reasons)


# ==========================================
# 2. Service-level Matching Workflow Tests
# ==========================================

@pytest.mark.asyncio
async def test_find_matches_lifecycle_checks():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="chef@bistro.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business = FoodBusiness(id=business_id, user_id=user_id, business_name="Bistro")

    # 1. Cancelled donation rejected
    cancelled_donation = Donation(
        id=uuid4(),
        business_id=business_id,
        title="Cancelled Soup",
        status=DonationStatus.CANCELLED,
        pickup_deadline=datetime.now(timezone.utc) + timedelta(hours=4),
        safe_consumption_deadline=datetime.now(timezone.utc) + timedelta(hours=8),
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [cancelled_donation, business]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc:
        await MatchingService.find_matches_for_donation(
            db=db_mock,
            user=donor_user,
            donation_id=cancelled_donation.id,
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "not eligible" in str(exc.value.detail).lower()

    # 2. Expired deadline donation rejected
    expired_donation = Donation(
        id=uuid4(),
        business_id=business_id,
        title="Expired Stew",
        status=DonationStatus.CREATED,
        pickup_deadline=datetime.now(timezone.utc) - timedelta(minutes=10),
        safe_consumption_deadline=datetime.now(timezone.utc) + timedelta(hours=2),
    )

    db_mock2 = AsyncMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [expired_donation, business]
    db_mock2.execute.return_value = exec_mock2

    with pytest.raises(HTTPException) as exc:
        await MatchingService.find_matches_for_donation(
            db=db_mock2,
            user=donor_user,
            donation_id=expired_donation.id,
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "expired" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_find_matches_ranking_and_tie_breaking():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="chef@bistro.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business = FoodBusiness(id=business_id, user_id=user_id, business_name="Bistro")

    now = datetime.now(timezone.utc)
    donation = Donation(
        id=uuid4(),
        business_id=business_id,
        title="50 Sandwiches",
        food_category=FoodCategory.PREPARED_MEALS,
        quantity_value=50.0,
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=15.0,
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Trays",
        pickup_deadline=now + timedelta(hours=3),
        safe_consumption_deadline=now + timedelta(hours=8),
        location=WKTElement("POINT(78.4867 17.3850)", srid=4326),
        status=DonationStatus.CREATED,
    )

    # Candidate 1: 2km away, large capacity, pickup capable -> High score
    org1_id = uuid4()
    org1 = Organization(
        id=org1_id,
        user_id=uuid4(),
        org_name="Central Food Bank",
        org_type=OrgType.FOOD_BANK,
        address_text="123 Main St",
        contact_phone="+1-555-0100",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=500.0,
        current_capacity_kg=50.0,
        accepted_categories=["PREPARED_MEALS"],
        can_pickup=True,
    )

    # Candidate 2: 15km away, smaller capacity, no pickup -> Lower score
    org2_id = uuid4()
    org2 = Organization(
        id=org2_id,
        user_id=uuid4(),
        org_name="Suburban Shelter",
        org_type=OrgType.SHELTER,
        address_text="999 Suburb Way",
        contact_phone="+1-555-0200",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=50.0,
        current_capacity_kg=20.0,
        accepted_categories=["PREPARED_MEALS"],
        can_pickup=False,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [donation, business]
    # Simulate DB returning the candidates with calculated distance_meters
    exec_mock.all.return_value = [
        (org2, 15000.0),
        (org1, 2000.0),
    ]
    db_mock.execute.return_value = exec_mock

    result = await MatchingService.find_matches_for_donation(
        db=db_mock,
        user=donor_user,
        donation_id=donation.id,
        max_radius_km=25.0,
    )

    assert result.total_candidates_found == 2
    # Org1 should be ranked #1 due to closer distance and direct pickup capability
    assert result.matches[0].organization_id == org1_id
    assert result.matches[0].rank == 1
    assert result.matches[1].organization_id == org2_id
    assert result.matches[1].rank == 2
    assert result.matches[0].score > result.matches[1].score


# ==========================================
# 3. API Endpoint & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_matching_rbac_forbidden_for_other_roles_and_tenants():
    owner_user = User(id=uuid4(), email="owner@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    intruder_user = User(id=uuid4(), email="other@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    org_user = User(id=uuid4(), email="director@shelter.com", role=UserRole.ORGANIZATION, is_active=True)
    vol_user = User(id=uuid4(), email="driver@courier.com", role=UserRole.VOLUNTEER, is_active=True)

    owner_biz_id = uuid4()
    intruder_biz_id = uuid4()
    owner_business = FoodBusiness(id=owner_biz_id, user_id=owner_user.id, business_name="Owner Kitchen")
    intruder_business = FoodBusiness(id=intruder_biz_id, user_id=intruder_user.id, business_name="Intruder Kitchen")

    donation_id = uuid4()
    donation = Donation(
        id=donation_id,
        business_id=owner_biz_id,
        title="Owner Donation",
        status=DonationStatus.CREATED,
        pickup_deadline=datetime.now(timezone.utc) + timedelta(hours=3),
    )

    # 1. Organization cannot access donation matching
    app.dependency_overrides[get_current_user] = lambda: org_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/donations/{donation_id}/matches", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()

    # 2. Volunteer cannot access donation matching
    app.dependency_overrides[get_current_user] = lambda: vol_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/donations/{donation_id}/matches", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()

    # 3. Other food business cannot access owner's donation matches
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [donation, intruder_business]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: intruder_user
    app.dependency_overrides[get_async_db] = lambda: db_mock
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/donations/{donation_id}/matches", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
            assert "permission" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_matching_success_response():
    user_id = uuid4()
    business_id = uuid4()
    donation_id = uuid4()
    org_id = uuid4()

    donor_user = User(id=user_id, email="owner@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business = FoodBusiness(id=business_id, user_id=user_id, business_name="Owner Kitchen")

    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4867, 17.3850), srid=4326)

    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="20 Fresh Sandwiches",
        food_category=FoodCategory.PREPARED_MEALS,
        quantity_value=20.0,
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=6.0,
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Sealed Boxes",
        available_from=now,
        pickup_deadline=now + timedelta(hours=4),
        safe_consumption_deadline=now + timedelta(hours=10),
        location=geo_point,
        status=DonationStatus.CREATED,
        created_at=now,
        updated_at=now,
    )

    org = Organization(
        id=org_id,
        user_id=uuid4(),
        org_name="City Community Kitchen",
        org_type=OrgType.SOUP_KITCHEN,
        address_text="12 Hope St",
        location=geo_point,
        contact_phone="+1-555-0333",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=100.0,
        current_capacity_kg=20.0,
        accepted_categories=["PREPARED_MEALS"],
        can_pickup=True,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [donation, business]
    exec_mock.all.return_value = [(org, 2500.0)]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: donor_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/donations/{donation_id}/matches?max_radius_km=10.0",
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert data["donation_id"] == str(donation_id)
            assert data["total_candidates_found"] == 1
            match = data["matches"][0]
            assert match["organization_id"] == str(org_id)
            assert match["org_name"] == "City Community Kitchen"
            assert match["distance_km"] == 2.5
            assert match["available_capacity_kg"] == 80.0
            assert match["rank"] == 1
            assert "verified_organization" in match["match_reasons"]
    finally:
        app.dependency_overrides.clear()
