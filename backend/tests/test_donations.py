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
from app.models.enums import BusinessType, DonationStatus, FoodCategory, QuantityUnit, StorageCondition, UserRole
from app.models.user import User
from app.schemas.common import LocationCoordinates
from app.schemas.donation import (
    DonationCancelRequest,
    DonationCreate,
    DonationResponse,
    DonationUpdate,
)
from app.services.donation_service import DonationService
from app.services.food_safety_service import FoodSafetyService


# ==========================================
# 1. Food Safety & Domain Validation Unit Tests
# ==========================================

def test_food_safety_quantities_validation():
    # Valid quantities
    FoodSafetyService.validate_quantities(quantity_value=Decimal("10.0"), total_weight_kg=Decimal("5.5"))

    # Non-positive quantity value
    with pytest.raises(HTTPException) as exc:
        FoodSafetyService.validate_quantities(quantity_value=Decimal("0"), total_weight_kg=Decimal("5.5"))
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST

    with pytest.raises(HTTPException) as exc:
        FoodSafetyService.validate_quantities(quantity_value=Decimal("-2.0"), total_weight_kg=Decimal("5.5"))
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST

    # Non-positive total weight
    with pytest.raises(HTTPException) as exc:
        FoodSafetyService.validate_quantities(quantity_value=Decimal("10.0"), total_weight_kg=Decimal("0"))
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST


def test_food_safety_temporal_window_validation():
    now = datetime.now(timezone.utc)
    available_from = now
    pickup_deadline = now + timedelta(hours=3)
    safe_consumption_deadline = now + timedelta(hours=6)
    prep_time = now - timedelta(hours=1)

    # Valid window
    FoodSafetyService.validate_temporal_window(
        available_from=available_from,
        pickup_deadline=pickup_deadline,
        safe_consumption_deadline=safe_consumption_deadline,
        preparation_time=prep_time,
    )

    # Pickup deadline <= available_from rejected
    with pytest.raises(HTTPException) as exc:
        FoodSafetyService.validate_temporal_window(
            available_from=pickup_deadline,
            pickup_deadline=available_from,
            safe_consumption_deadline=safe_consumption_deadline,
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "Pickup deadline must be strictly after" in str(exc.value.detail)

    # Safe consumption deadline < pickup deadline rejected
    with pytest.raises(HTTPException) as exc:
        FoodSafetyService.validate_temporal_window(
            available_from=available_from,
            pickup_deadline=pickup_deadline,
            safe_consumption_deadline=now + timedelta(hours=2),
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "Safe consumption deadline cannot be earlier" in str(exc.value.detail)

    # Safe consumption deadline <= prep time rejected
    with pytest.raises(HTTPException) as exc:
        FoodSafetyService.validate_temporal_window(
            available_from=available_from,
            pickup_deadline=pickup_deadline,
            safe_consumption_deadline=prep_time,
            preparation_time=prep_time,
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST


# ==========================================
# 2. Donation Service Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_donation_service_create_success_and_audit():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="chef@restaurant.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business_profile = FoodBusiness(
        id=business_id,
        user_id=user_id,
        business_name="Bistro Gourmet",
        business_type=BusinessType.RESTAURANT,
        address_text="123 Cuisine Way",
        location=WKTElement("POINT(78.4867 17.3850)", srid=4326),
        contact_phone="+1-555-0100",
    )

    now = datetime.now(timezone.utc)
    create_payload = DonationCreate(
        title="10 Boxes of Fresh Pastries",
        food_category=FoodCategory.BAKERY,
        quantity_value=Decimal("10"),
        quantity_unit=QuantityUnit.BOXES,
        total_weight_kg=Decimal("15.0"),
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        packaging_type="Cardboard Bakery Boxes",
        available_from=now,
        pickup_deadline=now + timedelta(hours=4),
        safe_consumption_deadline=now + timedelta(hours=24),
        location=LocationCoordinates(latitude=17.3850, longitude=78.4867),
        pickup_notes="Collect at back door",
    )

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = business_profile
    db_mock.execute.return_value = exec_mock

    donation = await DonationService.create_donation(
        db=db_mock,
        user=donor_user,
        data=create_payload,
        ip_address="192.168.1.50",
    )

    assert donation.title == "10 Boxes of Fresh Pastries"
    assert donation.business_id == business_id
    assert donation.status == DonationStatus.CREATED
    assert db_mock.commit.called

    # Verify audit log was recorded
    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 1
    assert audit_logs[0].action == "DONATION_CREATED"
    assert audit_logs[0].actor_id == user_id
    assert audit_logs[0].ip_address == "192.168.1.50"


@pytest.mark.asyncio
async def test_donation_service_create_requires_business_profile():
    user_id = uuid4()
    donor_user = User(id=user_id, email="chef@restaurant.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None  # No business profile found
    db_mock.execute.return_value = exec_mock

    now = datetime.now(timezone.utc)
    create_payload = DonationCreate(
        title="Leftover Sandwiches",
        food_category=FoodCategory.PREPARED_MEALS,
        quantity_value=Decimal("5"),
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=Decimal("3.0"),
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Clamshell Containers",
        pickup_deadline=now + timedelta(hours=2),
        safe_consumption_deadline=now + timedelta(hours=8),
        location=LocationCoordinates(latitude=17.3850, longitude=78.4867),
    )

    with pytest.raises(HTTPException) as exc:
        await DonationService.create_donation(
            db=db_mock,
            user=donor_user,
            data=create_payload,
        )
    assert exc.value.status_code == status.HTTP_404_NOT_FOUND
    assert "business profile not found" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_donation_service_update_and_ownership():
    user_id = uuid4()
    other_user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="chef@restaurant.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    other_user = User(id=other_user_id, email="intruder@other.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    business_profile = FoodBusiness(id=business_id, user_id=user_id, business_name="Bistro Gourmet")
    other_business_profile = FoodBusiness(id=uuid4(), user_id=other_user_id, business_name="Other Cafe")

    now = datetime.now(timezone.utc)
    donation_id = uuid4()
    donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="Vegetable Stew",
        food_category=FoodCategory.PREPARED_MEALS,
        quantity_value=10.0,
        quantity_unit=QuantityUnit.PORTIONS,
        total_weight_kg=8.0,
        storage_condition=StorageCondition.HOT_HOLDING,
        packaging_type="Soup Containers",
        available_from=now,
        pickup_deadline=now + timedelta(hours=3),
        safe_consumption_deadline=now + timedelta(hours=6),
        status=DonationStatus.CREATED,
    )

    # 1. Update rejected when attempted by another business
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock1 = MagicMock()
    exec_mock1.scalar_one_or_none.side_effect = [other_business_profile, donation]
    db_mock.execute.return_value = exec_mock1

    with pytest.raises(HTTPException) as exc:
        await DonationService.update_donation(
            db=db_mock,
            user=other_user,
            donation_id=donation_id,
            update_data=DonationUpdate(title="Hacked Title"),
        )
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN

    # 2. Update succeeds when performed by legitimate owner
    db_mock2 = AsyncMock()
    db_mock2.add = MagicMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [business_profile, donation]
    db_mock2.execute.return_value = exec_mock2

    updated = await DonationService.update_donation(
        db=db_mock2,
        user=donor_user,
        donation_id=donation_id,
        update_data=DonationUpdate(title="Freshly Made Vegetable Stew", quantity_value=Decimal("12.0")),
    )
    assert updated.title == "Freshly Made Vegetable Stew"
    assert updated.quantity_value == 12.0
    assert db_mock2.commit.called


@pytest.mark.asyncio
async def test_donation_service_cancel_lifecycle_and_terminal_states():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="chef@restaurant.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business_profile = FoodBusiness(id=business_id, user_id=user_id, business_name="Bistro Gourmet")

    now = datetime.now(timezone.utc)
    donation_id = uuid4()
    active_donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="Salad Bowls",
        food_category=FoodCategory.PRODUCE,
        quantity_value=5.0,
        quantity_unit=QuantityUnit.ITEMS,
        total_weight_kg=2.5,
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Plastic Bowls",
        available_from=now,
        pickup_deadline=now + timedelta(hours=2),
        safe_consumption_deadline=now + timedelta(hours=8),
        status=DonationStatus.CREATED,
    )

    # 1. Successful cancellation
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [business_profile, active_donation]
    db_mock.execute.return_value = exec_mock

    cancelled = await DonationService.cancel_donation(
        db=db_mock,
        user=donor_user,
        donation_id=donation_id,
        cancel_data=DonationCancelRequest(cancellation_reason="Accidentally dropped while packing"),
    )
    assert cancelled.status == DonationStatus.CANCELLED
    assert cancelled.cancellation_reason == "Accidentally dropped while packing"
    assert db_mock.commit.called

    # 2. Repeated cancellation rejected
    db_mock2 = AsyncMock()
    db_mock2.add = MagicMock()
    exec_mock2 = MagicMock()
    exec_mock2.scalar_one_or_none.side_effect = [business_profile, cancelled]
    db_mock2.execute.return_value = exec_mock2

    with pytest.raises(HTTPException) as exc:
        await DonationService.cancel_donation(
            db=db_mock2,
            user=donor_user,
            donation_id=donation_id,
            cancel_data=DonationCancelRequest(cancellation_reason="Repeat cancel attempt"),
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "already cancelled" in str(exc.value.detail).lower()

    # 3. Delivered donation cannot be cancelled
    delivered_donation = Donation(
        id=uuid4(),
        business_id=business_id,
        title="Delivered Feast",
        status=DonationStatus.DELIVERED,
    )
    db_mock3 = AsyncMock()
    db_mock3.add = MagicMock()
    exec_mock3 = MagicMock()
    exec_mock3.scalar_one_or_none.side_effect = [business_profile, delivered_donation]
    db_mock3.execute.return_value = exec_mock3

    with pytest.raises(HTTPException) as exc:
        await DonationService.cancel_donation(
            db=db_mock3,
            user=donor_user,
            donation_id=delivered_donation.id,
            cancel_data=DonationCancelRequest(cancellation_reason="Too late"),
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "terminal state" in str(exc.value.detail).lower()


# ==========================================
# 3. API Endpoint & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_donation_rbac_forbidden_for_other_roles():
    org_user = User(id=uuid4(), email="org@shelter.com", role=UserRole.ORGANIZATION, is_active=True)
    vol_user = User(id=uuid4(), email="vol@driver.com", role=UserRole.VOLUNTEER, is_active=True)

    # 1. Organization cannot create donation
    app.dependency_overrides[get_current_user] = lambda: org_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/donations",
                json={
                    "title": "Donation Attempt",
                    "food_category": "BAKERY",
                    "quantity_value": 5,
                    "quantity_unit": "ITEMS",
                    "total_weight_kg": 2.0,
                    "storage_condition": "ROOM_TEMPERATURE",
                    "packaging_type": "Box",
                    "pickup_deadline": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
                    "safe_consumption_deadline": (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
                    "location": {"latitude": 17.3850, "longitude": 78.4867},
                },
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()

    # 2. Volunteer cannot create donation
    app.dependency_overrides[get_current_user] = lambda: vol_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/donations",
                json={
                    "title": "Donation Attempt",
                    "food_category": "BAKERY",
                    "quantity_value": 5,
                    "quantity_unit": "ITEMS",
                    "total_weight_kg": 2.0,
                    "storage_condition": "ROOM_TEMPERATURE",
                    "packaging_type": "Box",
                    "pickup_deadline": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
                    "safe_consumption_deadline": (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
                    "location": {"latitude": 17.3850, "longitude": 78.4867},
                },
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_create_and_get_donation_success():
    user_id = uuid4()
    business_id = uuid4()
    donation_id = uuid4()
    donor_user = User(id=user_id, email="baker@croissant.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    business_profile = FoodBusiness(
        id=business_id,
        user_id=user_id,
        business_name="Parisienne Bakery",
        business_type=BusinessType.BAKERY,
        address_text="55 Rue de Paris",
        location=from_shape(Point(78.4867, 17.3850), srid=4326),
        contact_phone="+1-555-0988",
    )

    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4867, 17.3850), srid=4326)

    mock_donation = Donation(
        id=donation_id,
        business_id=business_id,
        title="20 Fresh Croissants",
        food_category=FoodCategory.BAKERY,
        quantity_value=20.0,
        quantity_unit=QuantityUnit.ITEMS,
        total_weight_kg=3.0,
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        packaging_type="Paper bags in carton box",
        available_from=now,
        pickup_deadline=now + timedelta(hours=3),
        safe_consumption_deadline=now + timedelta(hours=12),
        location=geo_point,
        status=DonationStatus.CREATED,
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    # Mock calls: 1. Business query (POST), 2. Donation query (GET), 3. Business query (GET)
    exec_mock.scalar_one_or_none.side_effect = [business_profile, mock_donation, business_profile]
    exec_mock.scalars.return_value.all.return_value = [mock_donation]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: donor_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. POST /api/v1/donations
            post_resp = await client.post(
                "/api/v1/donations",
                json={
                    "title": "20 Fresh Croissants",
                    "food_category": "BAKERY",
                    "quantity_value": 20.0,
                    "quantity_unit": "ITEMS",
                    "total_weight_kg": 3.0,
                    "storage_condition": "ROOM_TEMPERATURE",
                    "packaging_type": "Paper bags in carton box",
                    "pickup_deadline": (now + timedelta(hours=3)).isoformat(),
                    "safe_consumption_deadline": (now + timedelta(hours=12)).isoformat(),
                    "location": {"latitude": 17.3850, "longitude": 78.4867},
                },
                headers={"Authorization": "Bearer token"},
            )
            assert post_resp.status_code == status.HTTP_201_CREATED
            data = post_resp.json()
            assert data["title"] == "20 Fresh Croissants"
            assert data["food_category"] == "BAKERY"
            assert float(data["quantity_value"]) == 20.0

            # 2. GET /api/v1/donations/{donation_id}
            get_resp = await client.get(
                f"/api/v1/donations/{donation_id}",
                headers={"Authorization": "Bearer token"},
            )
            assert get_resp.status_code == status.HTTP_200_OK
            get_data = get_resp.json()
            assert get_data["id"] == str(donation_id)
            assert get_data["business_id"] == str(business_id)

    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_donation_ownership_isolation():
    user1_id = uuid4()
    user2_id = uuid4()
    business1_id = uuid4()
    business2_id = uuid4()
    donation_id = uuid4()

    user2 = User(id=user2_id, email="other@cafe.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business2 = FoodBusiness(id=business2_id, user_id=user2_id, business_name="Other Cafe")

    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4867, 17.3850), srid=4326)
    donation_owned_by_biz1 = Donation(
        id=donation_id,
        business_id=business1_id,
        title="Business 1 Specialty Cake",
        food_category=FoodCategory.BAKERY,
        quantity_value=1.0,
        quantity_unit=QuantityUnit.ITEMS,
        total_weight_kg=2.0,
        storage_condition=StorageCondition.REFRIGERATED,
        packaging_type="Cake Box",
        available_from=now,
        pickup_deadline=now + timedelta(hours=3),
        safe_consumption_deadline=now + timedelta(hours=12),
        location=geo_point,
        status=DonationStatus.CREATED,
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [donation_owned_by_biz1, business2]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: user2
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/donations/{donation_id}",
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_403_FORBIDDEN
            assert "permission" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_unauthenticated_cannot_create_donation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/donations",
            json={"title": "Unauthorized attempt"},
        )
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.asyncio
async def test_api_list_own_donations():
    user_id = uuid4()
    business_id = uuid4()
    donor_user = User(id=user_id, email="baker@croissant.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business_profile = FoodBusiness(id=business_id, user_id=user_id, business_name="Parisienne Bakery")

    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4867, 17.3850), srid=4326)
    d1 = Donation(
        id=uuid4(),
        business_id=business_id,
        title="Donation 1",
        food_category=FoodCategory.BAKERY,
        quantity_value=5.0,
        quantity_unit=QuantityUnit.ITEMS,
        total_weight_kg=1.0,
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        packaging_type="Box",
        available_from=now,
        pickup_deadline=now + timedelta(hours=2),
        safe_consumption_deadline=now + timedelta(hours=5),
        location=geo_point,
        status=DonationStatus.CREATED,
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = business_profile
    exec_mock.scalars.return_value.all.return_value = [d1]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: donor_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/donations", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert len(data) == 1
            assert data[0]["title"] == "Donation 1"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_update_and_cancel_ownership_isolation():
    user2_id = uuid4()
    business1_id = uuid4()
    business2_id = uuid4()
    donation_id = uuid4()

    user2 = User(id=user2_id, email="other@cafe.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    business2 = FoodBusiness(id=business2_id, user_id=user2_id, business_name="Other Cafe")

    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4867, 17.3850), srid=4326)
    donation_biz1 = Donation(
        id=donation_id,
        business_id=business1_id,
        title="Biz 1 Item",
        food_category=FoodCategory.BAKERY,
        quantity_value=5.0,
        quantity_unit=QuantityUnit.ITEMS,
        total_weight_kg=1.0,
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        packaging_type="Box",
        available_from=now,
        pickup_deadline=now + timedelta(hours=2),
        safe_consumption_deadline=now + timedelta(hours=5),
        location=geo_point,
        status=DonationStatus.CREATED,
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [business2, donation_biz1, business2, donation_biz1]
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: user2
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Update fails with 403
            patch_resp = await client.patch(
                f"/api/v1/donations/{donation_id}",
                json={"title": "Unauthorized update"},
                headers={"Authorization": "Bearer token"},
            )
            assert patch_resp.status_code == status.HTTP_403_FORBIDDEN

            # 2. Cancel fails with 403
            cancel_resp = await client.post(
                f"/api/v1/donations/{donation_id}/cancel",
                json={"cancellation_reason": "Unauthorized cancel"},
                headers={"Authorization": "Bearer token"},
            )
            assert cancel_resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()
