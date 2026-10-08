from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_current_user
from app.main import app
from app.models.enums import BusinessType, OrgType, OrgVerificationStatus, UserRole, VehicleType
from app.models.business import FoodBusiness
from app.models.organization import Organization
from app.models.volunteer import Volunteer
from app.models.user import User
from app.schemas.user import AdminUserDetailResponse, AdminUserResponse
from app.services.user_service import UserService


# Helper to build mock users
def create_mock_user(
    user_id: UUID = None,
    email: str = "donor@bakery.com",
    role: UserRole = UserRole.FOOD_BUSINESS,
    is_active: bool = True,
    is_verified: bool = True,
) -> User:
    u = User(
        id=user_id or uuid4(),
        email=email,
        password_hash="$argon2id$v=19$m=65536,t=3,p=4$fakehash",
        role=role,
        is_active=is_active,
        is_verified=is_verified,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    return u


# ==========================================
# 1. RBAC & Security Access Tests
# ==========================================

@pytest.mark.asyncio
async def test_admin_users_unauthenticated_fails():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/admin/users")
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.asyncio
@pytest.mark.parametrize("disallowed_role", [
    UserRole.FOOD_BUSINESS,
    UserRole.ORGANIZATION,
    UserRole.VOLUNTEER,
])
async def test_admin_users_non_admin_roles_forbidden(disallowed_role):
    non_admin = create_mock_user(role=disallowed_role)
    app.dependency_overrides[get_current_user] = lambda: non_admin
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/users")
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


# ==========================================
# 2. Admin Users Listing & Query Tests
# ==========================================

@pytest.mark.asyncio
async def test_admin_list_users_filters_and_fields():
    admin_user = create_mock_user(role=UserRole.ADMIN, email="admin@foodhelper.org")
    u1 = create_mock_user(email="biz@bakery.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    u2 = create_mock_user(email="shelter@ngo.org", role=UserRole.ORGANIZATION, is_active=False)

    app.dependency_overrides[get_current_user] = lambda: admin_user

    resp1 = AdminUserResponse.model_validate(u1)
    resp1.profile_name = "Artisan Bakery"
    resp2 = AdminUserResponse.model_validate(u2)
    resp2.profile_name = "Metropolis Food Bank"

    with patch.object(UserService, "list_admin_users", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [resp1, resp2]
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/users?role=FOOD_BUSINESS&search=bakery")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert len(data) == 2
                assert data[0]["email"] == "biz@bakery.com"
                assert data[0]["profile_name"] == "Artisan Bakery"
                assert data[0]["is_active"] is True
                assert data[1]["is_active"] is False

                # Ensure sensitive fields are NEVER exposed
                for user_item in data:
                    assert "password" not in user_item
                    assert "password_hash" not in user_item
                    assert "secret" not in user_item
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_get_user_detail_success_and_not_found():
    admin_user = create_mock_user(role=UserRole.ADMIN)
    target_user = create_mock_user(role=UserRole.ORGANIZATION, email="shelter@ngo.org")

    app.dependency_overrides[get_current_user] = lambda: admin_user

    with patch.object(UserService, "get_admin_user_by_id", new_callable=AsyncMock) as mock_get:
        detail_resp = AdminUserDetailResponse.model_validate(target_user)
        mock_get.return_value = detail_resp

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Success
                resp = await client.get(f"/api/v1/admin/users/{target_user.id}")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert data["id"] == str(target_user.id)
                assert data["email"] == "shelter@ngo.org"
                assert "password_hash" not in data

                # 2. Not found
                mock_get.return_value = None
                resp_404 = await client.get(f"/api/v1/admin/users/{uuid4()}")
                assert resp_404.status_code == status.HTTP_404_NOT_FOUND
        finally:
            app.dependency_overrides.clear()


# ==========================================
# 3. Activation & Deactivation Tests
# ==========================================

@pytest.mark.asyncio
async def test_admin_activate_user_endpoint():
    admin_user = create_mock_user(role=UserRole.ADMIN)
    target_user = create_mock_user(is_active=True)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    with patch.object(UserService, "activate_user", new_callable=AsyncMock) as mock_act:
        mock_act.return_value = AdminUserDetailResponse.model_validate(target_user)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/api/v1/admin/users/{target_user.id}/activate")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert data["is_active"] is True
                mock_act.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_deactivate_user_endpoint():
    admin_user = create_mock_user(role=UserRole.ADMIN)
    target_user = create_mock_user(is_active=False)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    with patch.object(UserService, "deactivate_user", new_callable=AsyncMock) as mock_deact:
        mock_deact.return_value = AdminUserDetailResponse.model_validate(target_user)

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/api/v1/admin/users/{target_user.id}/deactivate")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert data["is_active"] is False
                mock_deact.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()


# ==========================================
# 4. Service-Level Logic & Self-Protection Tests
# ==========================================

@pytest.mark.asyncio
async def test_service_deactivate_self_protection():
    admin_user = create_mock_user(role=UserRole.ADMIN, email="admin@foodhelper.org")
    db_mock = AsyncMock()

    with pytest.raises(Exception) as exc:
        await UserService.deactivate_user(
            db=db_mock,
            user_id=admin_user.id,
            admin_user=admin_user,
        )

    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "cannot deactivate their own account" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_service_activate_creates_audit_log():
    admin_user = create_mock_user(role=UserRole.ADMIN)
    inactive_user = create_mock_user(is_active=False)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = inactive_user
    db_mock.execute.return_value = exec_mock
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()

    added_entities = []
    db_mock.add = MagicMock(side_effect=lambda e: added_entities.append(e))

    res = await UserService.activate_user(
        db=db_mock,
        user_id=inactive_user.id,
        admin_user=admin_user,
        ip_address="10.0.0.1",
    )

    assert res.is_active is True
    db_mock.commit.assert_awaited_once()

    audit_entries = [e for e in added_entities if getattr(e, "__tablename__", "") == "audit_logs"]
    assert len(audit_entries) == 1
    assert audit_entries[0].action == "USER_ACTIVATED"
    assert audit_entries[0].actor_id == admin_user.id
    assert audit_entries[0].new_state["is_active"] is True


@pytest.mark.asyncio
async def test_service_deactivate_creates_audit_log():
    admin_user = create_mock_user(role=UserRole.ADMIN)
    active_user = create_mock_user(is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = active_user
    db_mock.execute.return_value = exec_mock
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()

    added_entities = []
    db_mock.add = MagicMock(side_effect=lambda e: added_entities.append(e))

    res = await UserService.deactivate_user(
        db=db_mock,
        user_id=active_user.id,
        admin_user=admin_user,
        ip_address="10.0.0.1",
    )

    assert res.is_active is False
    db_mock.commit.assert_awaited_once()

    audit_entries = [e for e in added_entities if getattr(e, "__tablename__", "") == "audit_logs"]
    assert len(audit_entries) == 1
    assert audit_entries[0].action == "USER_DEACTIVATED"
    assert audit_entries[0].actor_id == admin_user.id
    assert audit_entries[0].new_state["is_active"] is False
