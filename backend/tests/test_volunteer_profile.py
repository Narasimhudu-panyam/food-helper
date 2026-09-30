from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException, status
from httpx import ASGITransport, AsyncClient
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import from_shape
from pydantic import ValidationError
from shapely.geometry import Point

from app.api.dependencies import get_current_user
from app.core.database import get_async_db
from app.main import app
from app.models.audit import AuditLog
from app.models.enums import UserRole, VehicleType
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.common import LocationCoordinates
from app.schemas.volunteer import (
    VolunteerCreate,
    VolunteerResponse,
    VolunteerUpdate,
)
from app.services.volunteer_service import VolunteerService


# ==========================================
# 1. Volunteer Service Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_vol_service_create_profile_success_and_audit():
    user_id = uuid4()
    vol_user = User(id=user_id, email="driver@volunteer.org", role=UserRole.VOLUNTEER, is_active=True)

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    profile_data = VolunteerCreate(
        full_name="Morgan Swift",
        contact_phone="+1-555-0722",
        vehicle_type=VehicleType.CAR,
        has_insulated_bags=True,
        service_radius_km=Decimal("15.0"),
        home_location=LocationCoordinates(latitude=17.4100, longitude=78.4300),
    )

    volunteer = await VolunteerService.create_profile(
        db=db_mock,
        user=vol_user,
        profile_data=profile_data,
        ip_address="127.0.0.1",
    )

    assert volunteer.full_name == "Morgan Swift"
    assert volunteer.vehicle_type == VehicleType.CAR
    assert volunteer.has_insulated_bags is True
    assert volunteer.service_radius_km == Decimal("15.0")
    assert volunteer.is_available is True
    assert volunteer.user_id == user_id
    assert db_mock.add.call_count == 2  # Volunteer + AuditLog
    assert db_mock.commit.called


@pytest.mark.asyncio
async def test_vol_service_duplicate_profile_rejected():
    user_id = uuid4()
    vol_user = User(id=user_id, email="driver@volunteer.org", role=UserRole.VOLUNTEER, is_active=True)
    existing_vol = Volunteer(
        id=uuid4(),
        user_id=user_id,
        full_name="Existing Driver",
        contact_phone="+1-555-0722",
        vehicle_type=VehicleType.CAR,
        has_insulated_bags=False,
        service_radius_km=Decimal("10.0"),
        is_available=True,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_vol
    db_mock.execute.return_value = exec_mock

    profile_data = VolunteerCreate(
        full_name="Duplicate Attempt",
        contact_phone="+1-555-0722",
        vehicle_type=VehicleType.CAR,
    )

    with pytest.raises(HTTPException) as exc:
        await VolunteerService.create_profile(
            db=db_mock,
            user=vol_user,
            profile_data=profile_data,
        )
    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "already exists" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_vol_service_update_profile_and_availability():
    user_id = uuid4()
    vol_user = User(id=user_id, email="driver@volunteer.org", role=UserRole.VOLUNTEER, is_active=True)
    existing_vol = Volunteer(
        id=uuid4(),
        user_id=user_id,
        full_name="Morgan Swift",
        contact_phone="+1-555-0722",
        vehicle_type=VehicleType.FOOT_BIKE,
        has_insulated_bags=False,
        service_radius_km=Decimal("5.0"),
        is_available=True,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_vol
    db_mock.execute.return_value = exec_mock

    # 1. Update vehicle type, equipment, and availability toggle
    update_data = VolunteerUpdate(
        vehicle_type=VehicleType.VAN_TRUCK,
        has_insulated_bags=True,
        service_radius_km=Decimal("25.0"),
        is_available=False,
    )

    updated = await VolunteerService.update_profile(
        db=db_mock,
        user=vol_user,
        update_data=update_data,
    )

    assert updated.vehicle_type == VehicleType.VAN_TRUCK
    assert updated.has_insulated_bags is True
    assert updated.service_radius_km == Decimal("25.0")
    assert updated.is_available is False
    assert db_mock.add.called  # AuditLog was created
    assert db_mock.commit.called


@pytest.mark.asyncio
async def test_vol_service_update_profile_not_found():
    user_id = uuid4()
    vol_user = User(id=user_id, email="driver@volunteer.org", role=UserRole.VOLUNTEER, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc:
        await VolunteerService.update_profile(
            db=db_mock,
            user=vol_user,
            update_data=VolunteerUpdate(full_name="New Name"),
        )
    assert exc.value.status_code == status.HTTP_404_NOT_FOUND


# ==========================================
# 2. Schema Validation Tests
# ==========================================

def test_volunteer_radius_and_vehicle_validation():
    # Valid
    vol_in = VolunteerCreate(
        full_name="Test Driver",
        contact_phone="+1-555-0100",
        vehicle_type=VehicleType.CAR,
        service_radius_km=Decimal("50.0"),
    )
    assert vol_in.service_radius_km == Decimal("50.0")

    # Negative/Zero radius rejected
    with pytest.raises(ValidationError):
        VolunteerCreate(
            full_name="Test Driver",
            contact_phone="+1-555-0100",
            vehicle_type=VehicleType.CAR,
            service_radius_km=Decimal("0.0"),
        )

    # Over product-maximum (100 km) rejected
    with pytest.raises(ValidationError):
        VolunteerCreate(
            full_name="Test Driver",
            contact_phone="+1-555-0100",
            vehicle_type=VehicleType.CAR,
            service_radius_km=Decimal("150.0"),
        )


# ==========================================
# 3. API Endpoint & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_vol_profile_rbac_forbidden_for_other_roles():
    donor_user = User(id=uuid4(), email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    org_user = User(id=uuid4(), email="org@shelter.com", role=UserRole.ORGANIZATION, is_active=True)

    # 1. Food Business role blocked from Volunteer endpoints
    app.dependency_overrides[get_current_user] = lambda: donor_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/volunteers/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()

    # 2. Organization role blocked from Volunteer endpoints
    app.dependency_overrides[get_current_user] = lambda: org_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/volunteers/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_vol_profile_not_created_yet():
    user_id = uuid4()
    vol_user = User(id=user_id, email="driver@volunteer.org", role=UserRole.VOLUNTEER, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: vol_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/volunteers/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_404_NOT_FOUND
            assert "profile not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_create_and_get_vol_profile_success():
    user_id = uuid4()
    vol_user = User(id=user_id, email="driver@volunteer.org", role=UserRole.VOLUNTEER, is_active=True)

    vol_id = uuid4()
    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4300, 17.4100), srid=4326)

    mock_vol = Volunteer(
        id=vol_id,
        user_id=user_id,
        full_name="Morgan Swift",
        contact_phone="+1-555-0722",
        vehicle_type=VehicleType.CAR,
        has_insulated_bags=True,
        home_location=geo_point,
        service_radius_km=Decimal("15.0"),
        is_available=True,
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = mock_vol
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: vol_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            get_resp = await client.get("/api/v1/volunteers/profile", headers={"Authorization": "Bearer token"})
            assert get_resp.status_code == status.HTTP_200_OK
            data = get_resp.json()
            assert data["full_name"] == "Morgan Swift"
            assert data["vehicle_type"] == "CAR"
            assert data["has_insulated_bags"] is True
            assert float(data["service_radius_km"]) == 15.0
            assert data["is_available"] is True
            assert data["home_location"]["latitude"] == pytest.approx(17.4100, 0.001)
            assert data["home_location"]["longitude"] == pytest.approx(78.4300, 0.001)
            assert data["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()
