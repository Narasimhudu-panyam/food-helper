from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException, status
from httpx import ASGITransport, AsyncClient
from geoalchemy2.elements import WKTElement

from app.api.dependencies import get_current_user
from app.core.database import get_async_db
from app.main import app
from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    DonationStatus,
    FoodCategory,
    MatchStatus,
    PickupStatus,
    QuantityUnit,
    StorageCondition,
    TransportMode,
    UserRole,
)
from app.models.match import DonationMatch
from app.models.organization import Organization
from app.models.pickup import Pickup
from app.models.user import User
from app.schemas.pickup import (
    PickupCancelRequest,
    PickupCreateRequest,
    PickupFailRequest,
    PickupVerifyDeliveryRequest,
)
from app.services.pickup_service import PickupService


# ==========================================
# 1. Pickup Creation & Validation Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_create_pickup_success_and_audit():
    user_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()
    match_id = uuid4()

    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="City Shelter")

    now = datetime.now(timezone.utc)
    match = DonationMatch(
        id=match_id,
        donation_id=donation_id,
        organization_id=org_id,
        status=MatchStatus.ACCEPTED,
    )
    business_id = uuid4()
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Market")
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="Fresh Produce",
        total_weight_kg=15.0,
        available_from=now - timedelta(hours=1),
        pickup_deadline=now + timedelta(hours=4),
        status=DonationStatus.MATCHED,
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    # 1. MatchService.get_match_by_id (match lookup, org profile lookup), 2. DonationService.get_donation_by_id, 3. Duplicate pickup check, 4. Org lookup (notification), 5. Business lookup (notification)
    exec_mock.scalar_one_or_none.side_effect = [match, org, donation, None, org, business]
    db_mock.execute.return_value = exec_mock

    create_data = PickupCreateRequest(
        scheduled_pickup_time=now + timedelta(hours=2),
        transport_mode=TransportMode.ORG_DIRECT,
        notes="Will arrive with cargo van",
    )

    pickup = await PickupService.create_pickup_for_match(
        db=db_mock,
        user=org_user,
        match_id=match_id,
        create_data=create_data,
        ip_address="127.0.0.1",
    )

    assert pickup.donation_id == donation_id
    assert pickup.organization_id == org_id
    assert pickup.status == PickupStatus.ASSIGNED
    assert pickup.transport_mode == TransportMode.ORG_DIRECT
    assert db_mock.commit.called

    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 1
    assert audit_logs[0].action == "PICKUP_CREATED"


@pytest.mark.asyncio
async def test_create_pickup_unaccepted_match_or_unmatched_donation_rejected():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="City Shelter")

    # 1. Unaccepted match (status: INVITED) rejected
    invited_match = DonationMatch(
        id=uuid4(),
        donation_id=uuid4(),
        organization_id=org_id,
        status=MatchStatus.INVITED,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [invited_match, org]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc1:
        await PickupService.create_pickup_for_match(
            db=db_mock,
            user=org_user,
            match_id=invited_match.id,
            create_data=PickupCreateRequest(),
        )
    assert exc1.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "must be accepted" in str(exc1.value.detail).lower()

    # 2. Donation not in MATCHED state rejected
    accepted_match = DonationMatch(
        id=uuid4(),
        donation_id=uuid4(),
        organization_id=org_id,
        status=MatchStatus.ACCEPTED,
    )
    cancelled_donation = Donation(
        id=accepted_match.donation_id,
        business_id=uuid4(),
        title="Cancelled Item",
        status=DonationStatus.CANCELLED,
    )

    db_mock2 = AsyncMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [accepted_match, org, cancelled_donation]
    db_mock2.execute.return_value = exec_mock2

    with pytest.raises(HTTPException) as exc2:
        await PickupService.create_pickup_for_match(
            db=db_mock2,
            user=org_user,
            match_id=accepted_match.id,
            create_data=PickupCreateRequest(),
        )
    assert exc2.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "must be matched" in str(exc2.value.detail).lower()


@pytest.mark.asyncio
async def test_create_pickup_time_window_validation():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="City Shelter")

    now = datetime.now(timezone.utc)
    match = DonationMatch(
        id=uuid4(),
        donation_id=uuid4(),
        organization_id=org_id,
        status=MatchStatus.ACCEPTED,
    )
    donation = Donation(
        id=match.donation_id,
        business_id=uuid4(),
        title="Hot Soup",
        total_weight_kg=10.0,
        available_from=now + timedelta(hours=1),
        pickup_deadline=now + timedelta(hours=3),
        status=DonationStatus.MATCHED,
    )

    # 1. Scheduled pickup before available_from rejected
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [match, org, donation, None]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc1:
        await PickupService.create_pickup_for_match(
            db=db_mock,
            user=org_user,
            match_id=match.id,
            create_data=PickupCreateRequest(scheduled_pickup_time=now + timedelta(minutes=30)),  # Earlier than available_from (+1h)
        )
    assert exc1.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "earlier than donation available_from" in str(exc1.value.detail).lower()

    # 2. Scheduled pickup after pickup_deadline rejected
    db_mock2 = AsyncMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [match, org, donation, None]
    db_mock2.execute.return_value = exec_mock2

    with pytest.raises(HTTPException) as exc2:
        await PickupService.create_pickup_for_match(
            db=db_mock2,
            user=org_user,
            match_id=match.id,
            create_data=PickupCreateRequest(scheduled_pickup_time=now + timedelta(hours=5)),  # Later than deadline (+3h)
        )
    assert exc2.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "later than donation pickup_deadline" in str(exc2.value.detail).lower()


# ==========================================
# 2. Pickup Lifecycle & Completion Tests
# ==========================================

@pytest.mark.asyncio
async def test_pickup_start_and_transition():
    user_id = uuid4()
    org_id = uuid4()
    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="City Shelter")

    business_id = uuid4()
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Market")
    donation_id = uuid4()
    donation = Donation(id=donation_id, business_id=business_id, title="Apples", status=DonationStatus.MATCHED)

    pickup = Pickup(
        id=uuid4(),
        donation_id=donation_id,
        organization_id=org_id,
        transport_mode=TransportMode.ORG_DIRECT,
        status=PickupStatus.ASSIGNED,
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    # 1. Lock pickup, 2. Org lookup (auth), 3. Donation lookup (notify), 4. Business lookup (notify), 5. Org lookup (notify)
    exec_mock.scalar_one_or_none.side_effect = [pickup, org, donation, business, org]
    db_mock.execute.return_value = exec_mock

    started = await PickupService.start_pickup(
        db=db_mock,
        user=org_user,
        pickup_id=pickup.id,
        ip_address="127.0.0.1",
    )

    assert started.status == PickupStatus.IN_TRANSIT
    assert started.picked_up_at is not None
    assert db_mock.commit.called

    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 1
    assert audit_logs[0].action == "PICKUP_STARTED"


@pytest.mark.asyncio
async def test_pickup_complete_synchronizes_donation_to_delivered():
    user_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()
    pickup_id = uuid4()

    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="City Shelter", current_capacity_kg=50.0)

    now = datetime.now(timezone.utc)
    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        transport_mode=TransportMode.ORG_DIRECT,
        status=PickupStatus.IN_TRANSIT,
        picked_up_at=now - timedelta(minutes=45),
    )
    business_id = uuid4()
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Kitchen")
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="Sandwiches",
        total_weight_kg=20.0,
        status=DonationStatus.MATCHED,
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    # 1. Lock pickup, 2. Org profile lookup, 3. Lock donation, 4. Business lookup (notify)
    exec_mock.scalar_one_or_none.side_effect = [pickup, org, donation, business]
    db_mock.execute.return_value = exec_mock

    completed = await PickupService.complete_pickup(
        db=db_mock,
        user=org_user,
        pickup_id=pickup_id,
        verify_data=PickupVerifyDeliveryRequest(notes="Temperature at arrival: 3C. In perfect condition."),
        ip_address="127.0.0.1",
    )

    assert completed.status == PickupStatus.DELIVERED
    assert completed.delivered_at is not None
    assert donation.status == DonationStatus.DELIVERED
    assert "Temperature at arrival: 3C" in completed.notes
    assert db_mock.commit.called

    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 2
    actions = {a.action for a in audit_logs}
    assert "PICKUP_COMPLETED" in actions
    assert "DONATION_DELIVERED" in actions


@pytest.mark.asyncio
async def test_pickup_cancel_releases_capacity_and_resets_donation():
    user_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()
    pickup_id = uuid4()

    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(
        id=org_id,
        user_id=user_id,
        org_name="City Shelter",
        max_capacity_kg=100.0,
        current_capacity_kg=50.0,  # Holds 50kg (including 20kg for this donation)
    )

    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        transport_mode=TransportMode.ORG_DIRECT,
        status=PickupStatus.ASSIGNED,
    )
    business_id = uuid4()
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Kitchen")
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="Produce Crates",
        total_weight_kg=20.0,
        status=DonationStatus.MATCHED,
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    # 1. Lock pickup, 2. Lock donation, 3. Org profile lookup, 4. Lock org, 5. Business lookup (notify)
    exec_mock.scalar_one_or_none.side_effect = [pickup, donation, org, org, business]
    db_mock.execute.return_value = exec_mock

    cancelled = await PickupService.cancel_pickup(
        db=db_mock,
        user=org_user,
        pickup_id=pickup_id,
        cancel_data=PickupCancelRequest(cancellation_reason="Transport vehicle broke down"),
        ip_address="127.0.0.1",
    )

    assert cancelled.status == PickupStatus.CANCELLED
    # Capacity released: 50kg - 20kg = 30kg
    assert org.current_capacity_kg == 30.0
    # Donation reset to CREATED for re-offering
    assert donation.status == DonationStatus.CREATED
    assert db_mock.commit.called

    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 2
    actions = {a.action for a in audit_logs}
    assert "PICKUP_CANCELLED" in actions
    assert "CAPACITY_RELEASED" in actions


# ==========================================
# 3. API Endpoints & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_pickup_rbac_forbidden_for_unrelated_users():
    donor_user = User(id=uuid4(), email="donor@bistro.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    unrelated_org_user = User(id=uuid4(), email="other@shelter.org", role=UserRole.ORGANIZATION, is_active=True)

    pickup_id = uuid4()
    donation_id = uuid4()
    org_id = uuid4()

    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        status=PickupStatus.ASSIGNED,
        transport_mode=TransportMode.ORG_DIRECT,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    unrelated_org = Organization(id=uuid4(), user_id=unrelated_org_user.id, org_name="Unrelated Org")

    # Unrelated organization blocked from viewing pickup
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [pickup, unrelated_org]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: unrelated_org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/pickups/{pickup_id}", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_pickup_lifecycle_endpoints():
    user_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()
    pickup_id = uuid4()

    org_user = User(id=user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="City Shelter")

    now = datetime.now(timezone.utc)
    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        transport_mode=TransportMode.ORG_DIRECT,
        status=PickupStatus.ASSIGNED,
        created_at=now,
        updated_at=now,
    )
    business_id = uuid4()
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Kitchen")
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="Pasta Trays",
        total_weight_kg=10.0,
        status=DonationStatus.MATCHED,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    # 1. start_pickup: [pickup, org, donation, business, org], 2. complete_pickup: [pickup, org, donation, business]
    exec_mock.scalar_one_or_none.side_effect = [pickup, org, donation, business, org, pickup, org, donation, business]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Start pickup
            start_resp = await client.post(
                f"/api/v1/pickups/{pickup_id}/start",
                headers={"Authorization": "Bearer token"},
            )
            assert start_resp.status_code == status.HTTP_200_OK
            assert start_resp.json()["status"] == "IN_TRANSIT"

            # 2. Complete pickup
            complete_resp = await client.post(
                f"/api/v1/pickups/{pickup_id}/complete",
                json={"notes": "Received in good shape"},
                headers={"Authorization": "Bearer token"},
            )
            assert complete_resp.status_code == status.HTTP_200_OK
            assert complete_resp.json()["status"] == "DELIVERED"
    finally:
        app.dependency_overrides.clear()
