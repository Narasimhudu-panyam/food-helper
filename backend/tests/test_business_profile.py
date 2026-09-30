from datetime import datetime, timezone
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
from app.models.enums import BusinessType, UserRole
from app.models.user import User
from app.schemas.common import LocationCoordinates
from app.schemas.food_business import (
    FoodBusinessCreate,
    FoodBusinessResponse,
    FoodBusinessUpdate,
)
from app.services.business_service import BusinessService


# ==========================================
# 1. Business Service Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_business_service_create_profile_success():
    user_id = uuid4()
    donor_user = User(id=user_id, email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    # Mock no existing profile
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    profile_data = FoodBusinessCreate(
        business_name="Artisan Bakery",
        business_type=BusinessType.BAKERY,
        address_text="789 Baker Street",
        location=LocationCoordinates(latitude=17.4400, longitude=78.3800),
        contact_phone="+1-555-0499",
        pickup_instructions="Knock at rear kitchen gate",
    )

    profile = await BusinessService.create_profile(
        db=db_mock,
        user=donor_user,
        profile_data=profile_data,
    )

    assert profile.business_name == "Artisan Bakery"
    assert profile.business_type == BusinessType.BAKERY
    assert profile.user_id == user_id
    assert db_mock.add.called
    assert db_mock.commit.called


@pytest.mark.asyncio
async def test_business_service_duplicate_profile_rejected():
    user_id = uuid4()
    donor_user = User(id=user_id, email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    existing_profile = FoodBusiness(
        id=uuid4(),
        user_id=user_id,
        business_name="Existing Bakery",
        business_type=BusinessType.BAKERY,
        address_text="789 Baker Street",
        location=WKTElement("POINT(78.3800 17.4400)", srid=4326),
        contact_phone="+1-555-0499",
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_profile
    db_mock.execute.return_value = exec_mock

    profile_data = FoodBusinessCreate(
        business_name="Second Bakery",
        business_type=BusinessType.BAKERY,
        address_text="123 Other Street",
        location=LocationCoordinates(latitude=17.4400, longitude=78.3800),
        contact_phone="+1-555-0499",
    )

    with pytest.raises(HTTPException) as exc:
        await BusinessService.create_profile(
            db=db_mock,
            user=donor_user,
            profile_data=profile_data,
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "already exists" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_business_service_update_profile_success():
    user_id = uuid4()
    donor_user = User(id=user_id, email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    existing_profile = FoodBusiness(
        id=uuid4(),
        user_id=user_id,
        business_name="Old Bakery Name",
        business_type=BusinessType.BAKERY,
        address_text="789 Baker Street",
        location=WKTElement("POINT(78.3800 17.4400)", srid=4326),
        contact_phone="+1-555-0499",
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_profile
    db_mock.execute.return_value = exec_mock

    update_data = FoodBusinessUpdate(
        business_name="New Artisan Bakery Name",
        location=LocationCoordinates(latitude=17.4500, longitude=78.3900),
    )

    updated = await BusinessService.update_profile(
        db=db_mock,
        user=donor_user,
        update_data=update_data,
    )

    assert updated.business_name == "New Artisan Bakery Name"
    assert db_mock.commit.called


@pytest.mark.asyncio
async def test_business_service_update_profile_not_found():
    user_id = uuid4()
    donor_user = User(id=user_id, email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc:
        await BusinessService.update_profile(
            db=db_mock,
            user=donor_user,
            update_data=FoodBusinessUpdate(business_name="New Name"),
        )
    assert exc.value.status_code == status.HTTP_404_NOT_FOUND


# ==========================================
# 2. API Endpoint & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_business_profile_rbac_forbidden_for_other_roles():
    org_user = User(id=uuid4(), email="org@shelter.com", role=UserRole.ORGANIZATION, is_active=True)
    vol_user = User(id=uuid4(), email="vol@driver.com", role=UserRole.VOLUNTEER, is_active=True)

    # 1. Organization role blocked from business profile
    app.dependency_overrides[get_current_user] = lambda: org_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/businesses/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()

    # 2. Volunteer role blocked from business profile
    app.dependency_overrides[get_current_user] = lambda: vol_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/businesses/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_business_profile_not_created_yet():
    user_id = uuid4()
    donor_user = User(id=user_id, email="donor@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: donor_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/businesses/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_404_NOT_FOUND
            assert "profile not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_create_and_get_business_profile_success():
    user_id = uuid4()
    donor_user = User(id=user_id, email="donor@kitchen.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    profile_id = uuid4()
    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4867, 17.3850), srid=4326)

    mock_profile = FoodBusiness(
        id=profile_id,
        user_id=user_id,
        business_name="Grand Palace Hotel Kitchen",
        business_type=BusinessType.HOTEL,
        address_text="100 Royal Avenue",
        location=geo_point,
        contact_phone="+1-555-0922",
        pickup_instructions="Loading dock B",
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = mock_profile
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: donor_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            get_resp = await client.get("/api/v1/businesses/profile", headers={"Authorization": "Bearer token"})
            assert get_resp.status_code == status.HTTP_200_OK
            data = get_resp.json()
            assert data["business_name"] == "Grand Palace Hotel Kitchen"
            assert data["business_type"] == "HOTEL"
            assert data["location"]["latitude"] == pytest.approx(17.3850, 0.001)
            assert data["location"]["longitude"] == pytest.approx(78.4867, 0.001)
            assert data["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()
