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
from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    BusinessType,
    DonationStatus,
    FoodCategory,
    MatchStatus,
    OrgType,
    OrgVerificationStatus,
    QuantityUnit,
    StorageCondition,
    TransportMode,
    UserRole,
)
from app.models.match import DonationMatch
from app.models.organization import Organization
from app.models.user import User
from app.schemas.match import MatchAcceptRequest, MatchDeclineRequest, MatchOfferCreate
from app.services.match_service import MatchService


# ==========================================
# 1. Match Offer Creation Tests
# ==========================================

@pytest.mark.asyncio
async def test_create_match_offer_success_and_audit():
    user_id = uuid4()
    business_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()

    donor_user = User(id=user_id, email="donor@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business = FoodBusiness(id=business_id, user_id=user_id, business_name="Donor Kitchen")

    now = datetime.now(timezone.utc)
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="20 Meals",
        food_category=FoodCategory.PREPARED_MEALS,
        quantity_value=20.0,
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=10.0,
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Boxes",
        available_from=now,
        pickup_deadline=now + timedelta(hours=4),
        safe_consumption_deadline=now + timedelta(hours=10),
        location=WKTElement("POINT(78.4867 17.3850)", srid=4326),
        status=DonationStatus.CREATED,
    )

    org = Organization(
        id=org_id,
        user_id=uuid4(),
        org_name="Recipient Shelter",
        org_type=OrgType.SHELTER,
        address_text="123 Main St",
        contact_phone="+1-555-0100",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=100.0,
        current_capacity_kg=20.0,
        accepted_categories=["PREPARED_MEALS"],
        location=WKTElement("POINT(78.4900 17.3900)", srid=4326),
        can_pickup=True,
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    # 1. Business lookup, 2. Donation lookup, 3. Org lookup, 4. Duplicate match lookup, 5. Distance scalar
    exec_mock.scalar_one_or_none.side_effect = [business, donation, org, None]
    exec_mock.scalar.return_value = 1500.0  # 1500 meters
    db_mock.execute.return_value = exec_mock

    offer_data = MatchOfferCreate(organization_id=org_id)
    match = await MatchService.create_match_offer(
        db=db_mock,
        user=donor_user,
        donation_id=donation_id,
        offer_data=offer_data,
        ip_address="127.0.0.1",
    )

    assert match.donation_id == donation_id
    assert match.organization_id == org_id
    assert match.status == MatchStatus.INVITED
    assert match.distance_meters == Decimal("1500.00")
    assert db_mock.commit.called

    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 1
    assert audit_logs[0].action == "MATCH_OFFER_CREATED"
    assert audit_logs[0].actor_id == user_id


@pytest.mark.asyncio
async def test_create_match_offer_validation_failures():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="donor@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business = FoodBusiness(id=business_id, user_id=user_id, business_name="Donor Kitchen")

    now = datetime.now(timezone.utc)
    donation = Donation(
        id=uuid4(),
        business_id=business_id,
        title="20 Meals",
        food_category=FoodCategory.MEAT,
        quantity_value=20.0,
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=50.0,
        storage_condition=StorageCondition.FROZEN,
        packaging_type="Boxes",
        pickup_deadline=now + timedelta(hours=4),
        safe_consumption_deadline=now + timedelta(hours=10),
        status=DonationStatus.CREATED,
    )

    # 1. Unverified organization rejected
    unverified_org = Organization(
        id=uuid4(),
        user_id=uuid4(),
        org_name="Pending Pantry",
        verification_status=OrgVerificationStatus.PENDING,
        max_capacity_kg=100.0,
        current_capacity_kg=0.0,
        accepted_categories=["MEAT"],
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [business, donation, unverified_org]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc1:
        await MatchService.create_match_offer(
            db=db_mock,
            user=donor_user,
            donation_id=donation.id,
            offer_data=MatchOfferCreate(organization_id=unverified_org.id),
        )
    assert exc1.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "not verified" in str(exc1.value.detail).lower()

    # 2. Incompatible food category rejected
    verified_org_bad_cat = Organization(
        id=uuid4(),
        user_id=uuid4(),
        org_name="Veggie Only Food Bank",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=100.0,
        current_capacity_kg=0.0,
        accepted_categories=["PRODUCE", "BAKERY"],  # MEAT not accepted
    )

    db_mock2 = AsyncMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [business, donation, verified_org_bad_cat]
    db_mock2.execute.return_value = exec_mock2

    with pytest.raises(HTTPException) as exc2:
        await MatchService.create_match_offer(
            db=db_mock2,
            user=donor_user,
            donation_id=donation.id,
            offer_data=MatchOfferCreate(organization_id=verified_org_bad_cat.id),
        )
    assert exc2.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "does not accept food category" in str(exc2.value.detail).lower()

    # 3. Insufficient capacity rejected (Donation=50kg, Available=20kg)
    verified_org_low_cap = Organization(
        id=uuid4(),
        user_id=uuid4(),
        org_name="Small Shelter",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=100.0,
        current_capacity_kg=80.0,  # Available: 20kg < 50kg
        accepted_categories=["MEAT"],
    )

    db_mock3 = AsyncMock()
    exec_mock3 = MagicMock()
    exec_mock3.scalar_one_or_none.side_effect = [business, donation, verified_org_low_cap]
    db_mock3.execute.return_value = exec_mock3

    with pytest.raises(HTTPException) as exc3:
        await MatchService.create_match_offer(
            db=db_mock3,
            user=donor_user,
            donation_id=donation.id,
            offer_data=MatchOfferCreate(organization_id=verified_org_low_cap.id),
        )
    assert exc3.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "insufficient" in str(exc3.value.detail).lower()


@pytest.mark.asyncio
async def test_create_match_offer_duplicate_rejected():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="donor@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business = FoodBusiness(id=business_id, user_id=user_id, business_name="Donor Kitchen")

    now = datetime.now(timezone.utc)
    donation = Donation(
        id=uuid4(),
        business_id=business_id,
        title="20 Meals",
        food_category=FoodCategory.PREPARED_MEALS,
        quantity_value=20.0,
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=10.0,
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Boxes",
        pickup_deadline=now + timedelta(hours=4),
        safe_consumption_deadline=now + timedelta(hours=10),
        status=DonationStatus.CREATED,
    )

    org = Organization(
        id=uuid4(),
        user_id=uuid4(),
        org_name="Recipient Shelter",
        verification_status=OrgVerificationStatus.VERIFIED,
        max_capacity_kg=100.0,
        current_capacity_kg=0.0,
        accepted_categories=["PREPARED_MEALS"],
    )

    existing_active_match = DonationMatch(
        id=uuid4(),
        donation_id=donation.id,
        organization_id=org.id,
        status=MatchStatus.INVITED,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [business, donation, org, existing_active_match]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc:
        await MatchService.create_match_offer(
            db=db_mock,
            user=donor_user,
            donation_id=donation.id,
            offer_data=MatchOfferCreate(organization_id=org.id),
        )
    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "already exists" in str(exc.value.detail).lower()


# ==========================================
# 2. Match Acceptance & Atomic Capacity Tests
# ==========================================

@pytest.mark.asyncio
async def test_accept_match_atomic_success_and_capacity_reservation():
    user_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()
    match_id = uuid4()

    org_user = User(id=user_id, email="director@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org_profile = Organization(
        id=org_id,
        user_id=user_id,
        org_name="Recipient Shelter",
        max_capacity_kg=100.0,
        current_capacity_kg=20.0,
    )

    now = datetime.now(timezone.utc)
    match = DonationMatch(
        id=match_id,
        donation_id=donation_id,
        organization_id=org_id,
        distance_meters=Decimal("1200.00"),
        score=Decimal("92.50"),
        rank_order=1,
        status=MatchStatus.INVITED,
    )

    business_id = uuid4()
    donor_business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Bakery")
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="30kg Rice & Curry",
        total_weight_kg=30.0,
        pickup_deadline=now + timedelta(hours=3),
        status=DonationStatus.CREATED,
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    # 1. Lock match, 2. Org user profile, 3. Lock donation, 4. Lock org, 5. Donor business lookup for notification
    exec_mock.scalar_one_or_none.side_effect = [match, org_profile, donation, org_profile, donor_business]
    db_mock.execute.return_value = exec_mock

    accepted = await MatchService.accept_match(
        db=db_mock,
        user=org_user,
        match_id=match_id,
        accept_data=MatchAcceptRequest(transport_mode=TransportMode.ORG_DIRECT),
        ip_address="10.0.0.1",
    )

    assert accepted.status == MatchStatus.ACCEPTED
    assert donation.status == DonationStatus.MATCHED
    assert org_profile.current_capacity_kg == 50.0  # 20kg + 30kg = 50kg
    assert db_mock.commit.called

    # Check that 2 audit logs were generated (MATCH_ACCEPTED and CAPACITY_RESERVED)
    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 2
    actions = {a.action for a in audit_logs}
    assert "MATCH_ACCEPTED" in actions
    assert "CAPACITY_RESERVED" in actions


@pytest.mark.asyncio
async def test_accept_match_insufficient_capacity_at_moment_of_acceptance():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="director@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org_profile = Organization(
        id=org_id,
        user_id=user_id,
        org_name="Recipient Shelter",
        max_capacity_kg=100.0,
        current_capacity_kg=85.0,  # Only 15kg available
    )

    match = DonationMatch(
        id=uuid4(),
        donation_id=uuid4(),
        organization_id=org_id,
        status=MatchStatus.INVITED,
    )

    donation = Donation(
        id=match.donation_id,
        total_weight_kg=25.0,  # Requires 25kg > 15kg available
        pickup_deadline=datetime.now(timezone.utc) + timedelta(hours=3),
        status=DonationStatus.CREATED,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [match, org_profile, donation, org_profile]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc:
        await MatchService.accept_match(
            db=db_mock,
            user=org_user,
            match_id=match.id,
            accept_data=MatchAcceptRequest(transport_mode=TransportMode.VOLUNTEER),
        )
    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "insufficient capacity" in str(exc.value.detail).lower()
    # Ensure capacity was untouched
    assert org_profile.current_capacity_kg == 85.0
    assert donation.status == DonationStatus.CREATED


@pytest.mark.asyncio
async def test_accept_match_idempotency_and_invalid_transitions():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="director@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org_profile = Organization(id=org_id, user_id=user_id, org_name="Recipient Shelter")

    # 1. Accepting already accepted match rejected with 409
    already_accepted_match = DonationMatch(
        id=uuid4(),
        organization_id=org_id,
        status=MatchStatus.ACCEPTED,
    )
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [already_accepted_match, org_profile]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc1:
        await MatchService.accept_match(
            db=db_mock,
            user=org_user,
            match_id=already_accepted_match.id,
            accept_data=MatchAcceptRequest(transport_mode=TransportMode.ORG_DIRECT),
        )
    assert exc1.value.status_code == status.HTTP_409_CONFLICT
    assert "already accepted" in str(exc1.value.detail).lower()

    # 2. Accepting declined match rejected with 400
    declined_match = DonationMatch(
        id=uuid4(),
        organization_id=org_id,
        status=MatchStatus.DECLINED,
    )
    db_mock2 = AsyncMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [declined_match, org_profile]
    db_mock2.execute.return_value = exec_mock2

    with pytest.raises(HTTPException) as exc2:
        await MatchService.accept_match(
            db=db_mock2,
            user=org_user,
            match_id=declined_match.id,
            accept_data=MatchAcceptRequest(transport_mode=TransportMode.ORG_DIRECT),
        )
    assert exc2.value.status_code == status.HTTP_400_BAD_REQUEST


# ==========================================
# 3. Match Decline Tests
# ==========================================

@pytest.mark.asyncio
async def test_decline_match_success_and_invariants():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="director@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org_profile = Organization(
        id=org_id,
        user_id=user_id,
        org_name="Recipient Shelter",
        max_capacity_kg=100.0,
        current_capacity_kg=20.0,
    )

    match_donation_id = uuid4()
    match = DonationMatch(
        id=uuid4(),
        donation_id=match_donation_id,
        organization_id=org_id,
        status=MatchStatus.INVITED,
    )
    donation = Donation(
        id=match_donation_id,
        business_id=uuid4(),
        title="Apples",
        status=DonationStatus.CREATED,
    )
    donor_business = FoodBusiness(id=donation.business_id, user_id=uuid4(), business_name="Donor Market")

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [match, org_profile, donation, donor_business]
    db_mock.execute.return_value = exec_mock

    declined = await MatchService.decline_match(
        db=db_mock,
        user=org_user,
        match_id=match.id,
        decline_data=MatchDeclineRequest(rejection_reason="Storage facility undergoing scheduled sanitation"),
    )

    assert declined.status == MatchStatus.DECLINED
    assert declined.rejection_reason == "Storage facility undergoing scheduled sanitation"
    assert org_profile.current_capacity_kg == 20.0  # Capacity untouched
    assert db_mock.commit.called

    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 1
    assert audit_logs[0].action == "MATCH_OFFER_DECLINED"


# ==========================================
# 4. API Endpoints & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_match_rbac_forbidden_for_volunteers_and_unrelated_users():
    vol_user = User(id=uuid4(), email="vol@courier.com", role=UserRole.VOLUNTEER, is_active=True)
    match_id = uuid4()

    app.dependency_overrides[get_current_user] = lambda: vol_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Volunteer cannot accept match
            resp1 = await client.post(
                f"/api/v1/matches/{match_id}/accept",
                json={"transport_mode": "ORG_DIRECT"},
                headers={"Authorization": "Bearer token"},
            )
            assert resp1.status_code == status.HTTP_403_FORBIDDEN

            # 2. Volunteer cannot decline match
            resp2 = await client.post(
                f"/api/v1/matches/{match_id}/decline",
                json={"rejection_reason": "Not authorized"},
                headers={"Authorization": "Bearer token"},
            )
            assert resp2.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_list_incoming_matches_for_organization():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="org@bank.org", role=UserRole.ORGANIZATION, is_active=True)
    org_profile = Organization(id=org_id, user_id=user_id, org_name="City Food Bank")

    now = datetime.now(timezone.utc)
    match1 = DonationMatch(
        id=uuid4(),
        donation_id=uuid4(),
        organization_id=org_id,
        distance_meters=Decimal("3000.00"),
        score=Decimal("85.00"),
        rank_order=1,
        status=MatchStatus.INVITED,
        created_at=now,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = org_profile
    exec_mock.scalars.return_value.all.return_value = [match1]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/organizations/matches", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert len(data) == 1
            assert data[0]["organization_id"] == str(org_id)
            assert data[0]["status"] == "INVITED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_match_details_and_multi_tenant_authorization():
    donor_user_id = uuid4()
    org_user_id = uuid4()
    unrelated_user_id = uuid4()

    donor_user = User(id=donor_user_id, email="donor@bistro.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    org_user = User(id=org_user_id, email="org@bank.org", role=UserRole.ORGANIZATION, is_active=True)
    unrelated_org_user = User(id=unrelated_user_id, email="other@org.com", role=UserRole.ORGANIZATION, is_active=True)

    business = FoodBusiness(id=uuid4(), user_id=donor_user_id, business_name="Donor Bistro")
    org = Organization(id=uuid4(), user_id=org_user_id, org_name="City Food Bank")
    unrelated_org = Organization(id=uuid4(), user_id=unrelated_user_id, org_name="Unrelated Shelter")

    match_id = uuid4()
    donation_id = uuid4()
    donation = Donation(id=donation_id, business_id=business.id, title="Surplus Stew")

    match = DonationMatch(
        id=match_id,
        donation_id=donation_id,
        organization_id=org.id,
        distance_meters=Decimal("1500.00"),
        score=Decimal("90.00"),
        rank_order=1,
        status=MatchStatus.INVITED,
        created_at=datetime.now(timezone.utc),
    )

    # 1. Recipient organization can read match details
    db_mock = AsyncMock()
    exec_mock1 = MagicMock()
    exec_mock1.scalar_one_or_none.side_effect = [match, org]
    db_mock.execute.return_value = exec_mock1

    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/matches/{match_id}", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            assert resp.json()["id"] == str(match_id)
    finally:
        app.dependency_overrides.clear()

    # 2. Donor kitchen can read match details
    db_mock2 = AsyncMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [match, business, donation]
    db_mock2.execute.return_value = exec_mock2

    app.dependency_overrides[get_current_user] = lambda: donor_user
    app.dependency_overrides[get_async_db] = lambda: db_mock2
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/matches/{match_id}", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
    finally:
        app.dependency_overrides.clear()

    # 3. Unrelated organization is blocked with 403
    db_mock3 = AsyncMock()
    exec_mock3 = MagicMock()
    exec_mock3.scalar_one_or_none.side_effect = [match, unrelated_org]
    db_mock3.execute.return_value = exec_mock3

    app.dependency_overrides[get_current_user] = lambda: unrelated_org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock3
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/matches/{match_id}", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_accept_and_decline_endpoints():
    org_user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=org_user_id, email="director@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org_profile = Organization(
        id=org_id,
        user_id=org_user_id,
        org_name="Recipient Shelter",
        max_capacity_kg=100.0,
        current_capacity_kg=10.0,
    )

    match_id = uuid4()
    donation_id = uuid4()
    now = datetime.now(timezone.utc)
    match = DonationMatch(
        id=match_id,
        donation_id=donation_id,
        organization_id=org_id,
        distance_meters=Decimal("500.00"),
        score=Decimal("95.00"),
        rank_order=1,
        status=MatchStatus.INVITED,
        created_at=now,
    )
    donor_business_id = uuid4()
    donor_business = FoodBusiness(id=donor_business_id, user_id=uuid4(), business_name="Donor Kitchen")
    donation = Donation(
        id=donation_id,
        business_id=donor_business_id,
        total_weight_kg=20.0,
        pickup_deadline=now + timedelta(hours=3),
        status=DonationStatus.CREATED,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [match, org_profile, donation, org_profile, donor_business]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/matches/{match_id}/accept",
                json={"transport_mode": "VOLUNTEER"},
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert data["status"] == "ACCEPTED"
    finally:
        app.dependency_overrides.clear()
