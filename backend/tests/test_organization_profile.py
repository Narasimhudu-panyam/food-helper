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
from app.models.enums import FoodCategory, OrgType, OrgVerificationStatus, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.common import LocationCoordinates
from app.schemas.organization import (
    OrganizationAdminVerificationUpdate,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.services.organization_service import OrganizationService


# ==========================================
# 1. Organization Service Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_org_service_create_profile_success_and_audit():
    user_id = uuid4()
    org_user = User(id=user_id, email="shelter@help.org", role=UserRole.ORGANIZATION, is_active=True)

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    profile_data = OrganizationCreate(
        org_name="Community Hope Shelter",
        org_type=OrgType.SHELTER,
        tax_id="501C3-112233",
        address_text="456 Relief Blvd, City Center",
        location=LocationCoordinates(latitude=17.4200, longitude=78.4500),
        contact_phone="+1-555-0899",
        max_capacity_kg=Decimal("300.0"),
        accepted_categories=["PREPARED_MEALS", "BAKERY", "PRODUCE"],
        can_pickup=True,
    )

    org = await OrganizationService.create_profile(
        db=db_mock,
        user=org_user,
        profile_data=profile_data,
        ip_address="127.0.0.1",
    )

    assert org.org_name == "Community Hope Shelter"
    assert org.max_capacity_kg == Decimal("300.0")
    assert org.current_capacity_kg == Decimal("0.0")
    assert org.verification_status == OrgVerificationStatus.PENDING
    assert org.accepted_categories == ["PREPARED_MEALS", "BAKERY", "PRODUCE"]
    assert db_mock.add.call_count == 2  # Organization + AuditLog
    assert db_mock.commit.called


@pytest.mark.asyncio
async def test_org_service_duplicate_profile_rejected():
    user_id = uuid4()
    org_user = User(id=user_id, email="shelter@help.org", role=UserRole.ORGANIZATION, is_active=True)
    existing_org = Organization(
        id=uuid4(),
        user_id=user_id,
        org_name="Existing Shelter",
        org_type=OrgType.SHELTER,
        address_text="456 Relief Blvd",
        location=WKTElement("POINT(78.4500 17.4200)", srid=4326),
        contact_phone="+1-555-0899",
        max_capacity_kg=Decimal("200.0"),
        current_capacity_kg=Decimal("0.0"),
        can_pickup=True,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_org
    db_mock.execute.return_value = exec_mock

    profile_data = OrganizationCreate(
        org_name="Duplicate Attempt",
        org_type=OrgType.SHELTER,
        address_text="456 Relief Blvd",
        location=LocationCoordinates(latitude=17.4200, longitude=78.4500),
        contact_phone="+1-555-0899",
        max_capacity_kg=Decimal("200.0"),
    )

    with pytest.raises(HTTPException) as exc:
        await OrganizationService.create_profile(
            db=db_mock,
            user=org_user,
            profile_data=profile_data,
        )
    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "already exists" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_org_service_update_capacity_validation():
    user_id = uuid4()
    org_user = User(id=user_id, email="shelter@help.org", role=UserRole.ORGANIZATION, is_active=True)
    existing_org = Organization(
        id=uuid4(),
        user_id=user_id,
        org_name="Community Shelter",
        org_type=OrgType.SHELTER,
        address_text="456 Relief Blvd",
        location=WKTElement("POINT(78.4500 17.4200)", srid=4326),
        contact_phone="+1-555-0899",
        max_capacity_kg=Decimal("200.0"),
        current_capacity_kg=Decimal("50.0"),
        accepted_categories=["BAKERY"],
        can_pickup=True,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_org
    db_mock.execute.return_value = exec_mock

    # 1. Valid update: increase max capacity & current capacity
    valid_update = OrganizationUpdate(
        max_capacity_kg=Decimal("300.0"),
        current_capacity_kg=Decimal("120.0"),
    )
    updated = await OrganizationService.update_profile(
        db=db_mock,
        user=org_user,
        update_data=valid_update,
    )
    assert updated.max_capacity_kg == Decimal("300.0")
    assert updated.current_capacity_kg == Decimal("120.0")

    # 2. Invalid update: current capacity > max capacity rejected
    invalid_update = OrganizationUpdate(
        current_capacity_kg=Decimal("350.0"),  # exceeds max 300
    )
    with pytest.raises(HTTPException) as exc:
        await OrganizationService.update_profile(
            db=db_mock,
            user=org_user,
            update_data=invalid_update,
        )
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "cannot exceed maximum capacity" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_org_service_admin_verification_update():
    org_id = uuid4()
    admin_id = uuid4()
    admin_user = User(id=admin_id, email="admin@foodhelper.org", role=UserRole.ADMIN, is_active=True)

    existing_org = Organization(
        id=org_id,
        user_id=uuid4(),
        org_name="Pending Charity",
        org_type=OrgType.FOOD_BANK,
        address_text="123 Warehouse Row",
        location=WKTElement("POINT(78.4000 17.4000)", srid=4326),
        contact_phone="+1-555-0100",
        verification_status=OrgVerificationStatus.PENDING,
        max_capacity_kg=Decimal("1000.0"),
        current_capacity_kg=Decimal("0.0"),
        accepted_categories=["PRODUCE", "PACKAGED"],
        can_pickup=True,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_org
    db_mock.execute.return_value = exec_mock

    verif_data = OrganizationAdminVerificationUpdate(
        verification_status=OrgVerificationStatus.VERIFIED,
    )

    verified_org = await OrganizationService.admin_update_verification(
        db=db_mock,
        organization_id=org_id,
        admin_user=admin_user,
        verification_data=verif_data,
        ip_address="10.0.0.1",
    )

    assert verified_org.verification_status == OrgVerificationStatus.VERIFIED
    assert db_mock.add.called  # AuditLog was created
    assert db_mock.commit.called


# ==========================================
# 2. Food Category Validation Tests
# ==========================================

def test_food_category_validation_and_deduplication():
    # Valid & normalized
    raw_categories = ["bakery", "PREPARED_MEALS", "produce", "BAKERY"]
    org_in = OrganizationCreate(
        org_name="Test Food Bank",
        org_type=OrgType.FOOD_BANK,
        address_text="123 Test St",
        location=LocationCoordinates(latitude=17.4000, longitude=78.4000),
        contact_phone="+1-555-0999",
        max_capacity_kg=Decimal("500.0"),
        accepted_categories=raw_categories,
    )
    # Check uppercase and deduplicated
    assert org_in.accepted_categories == ["BAKERY", "PREPARED_MEALS", "PRODUCE"]

    # Invalid category rejected
    with pytest.raises(ValidationError) as exc:
        OrganizationCreate(
            org_name="Test Food Bank",
            org_type=OrgType.FOOD_BANK,
            address_text="123 Test St",
            location=LocationCoordinates(latitude=17.4000, longitude=78.4000),
            contact_phone="+1-555-0999",
            max_capacity_kg=Decimal("500.0"),
            accepted_categories=["INVALID_FOOD_CATEGORY_XYZ"],
        )
    assert "Invalid food category" in str(exc.value)


# ==========================================
# 3. API Endpoint & RBAC Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_org_profile_rbac_forbidden_for_other_roles():
    donor_user = User(id=uuid4(), email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    vol_user = User(id=uuid4(), email="vol@driver.com", role=UserRole.VOLUNTEER, is_active=True)

    # 1. Food Business role blocked from Organization endpoints
    app.dependency_overrides[get_current_user] = lambda: donor_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/organizations/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()

    # 2. Volunteer role blocked from Organization endpoints
    app.dependency_overrides[get_current_user] = lambda: vol_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/organizations/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_org_profile_not_created_yet():
    user_id = uuid4()
    org_user = User(id=user_id, email="shelter@help.org", role=UserRole.ORGANIZATION, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/organizations/profile", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_404_NOT_FOUND
            assert "profile not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_create_and_get_org_profile_success():
    user_id = uuid4()
    org_user = User(id=user_id, email="shelter@help.org", role=UserRole.ORGANIZATION, is_active=True)

    org_id = uuid4()
    now = datetime.now(timezone.utc)
    geo_point = from_shape(Point(78.4500, 17.4200), srid=4326)

    mock_org = Organization(
        id=org_id,
        user_id=user_id,
        org_name="City Soup Kitchen",
        org_type=OrgType.SOUP_KITCHEN,
        tax_id="501C3-999888",
        address_text="789 Relief Center Ave",
        location=geo_point,
        contact_phone="+1-555-0811",
        verification_status=OrgVerificationStatus.PENDING,
        max_capacity_kg=Decimal("400.0"),
        current_capacity_kg=Decimal("0.0"),
        accepted_categories=["PREPARED_MEALS", "PRODUCE"],
        can_pickup=True,
        operating_hours={"monday": {"open": "08:00", "close": "18:00"}},
        created_at=now,
        updated_at=now,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = mock_org
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            get_resp = await client.get("/api/v1/organizations/profile", headers={"Authorization": "Bearer token"})
            assert get_resp.status_code == status.HTTP_200_OK
            data = get_resp.json()
            assert data["org_name"] == "City Soup Kitchen"
            assert data["org_type"] == "SOUP_KITCHEN"
            assert data["verification_status"] == "PENDING"
            assert data["location"]["latitude"] == pytest.approx(17.4200, 0.001)
            assert data["location"]["longitude"] == pytest.approx(78.4500, 0.001)
            assert float(data["max_capacity_kg"]) == 400.0
            assert data["accepted_categories"] == ["PREPARED_MEALS", "PRODUCE"]
            assert data["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_admin_verification_rbac_and_execution():
    org_id = uuid4()
    admin_user = User(id=uuid4(), email="admin@foodhelper.org", role=UserRole.ADMIN, is_active=True)
    org_user = User(id=uuid4(), email="shelter@help.org", role=UserRole.ORGANIZATION, is_active=True)
    donor_user = User(id=uuid4(), email="donor@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    mock_org = Organization(
        id=org_id,
        user_id=org_user.id,
        org_name="City Shelter",
        org_type=OrgType.SHELTER,
        address_text="789 Relief Center Ave",
        location=WKTElement("POINT(78.4500 17.4200)", srid=4326),
        contact_phone="+1-555-0811",
        verification_status=OrgVerificationStatus.PENDING,
        max_capacity_kg=Decimal("400.0"),
        current_capacity_kg=Decimal("0.0"),
        accepted_categories=["PREPARED_MEALS"],
        can_pickup=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = mock_org
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_async_db] = lambda: db_mock

    # 1. Non-admin (Organization) rejected from verification endpoint
    app.dependency_overrides[get_current_user] = lambda: org_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            f"/api/v1/organizations/{org_id}/verification",
            json={"verification_status": "VERIFIED"},
            headers={"Authorization": "Bearer token"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    # 2. Non-admin (Food Business) rejected from verification endpoint
    app.dependency_overrides[get_current_user] = lambda: donor_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            f"/api/v1/organizations/{org_id}/verification",
            json={"verification_status": "VERIFIED"},
            headers={"Authorization": "Bearer token"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    # 3. Admin user succeeds in verifying organization
    app.dependency_overrides[get_current_user] = lambda: admin_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            f"/api/v1/organizations/{org_id}/verification",
            json={"verification_status": "VERIFIED"},
            headers={"Authorization": "Bearer token"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["verification_status"] == "VERIFIED"

    app.dependency_overrides.clear()
