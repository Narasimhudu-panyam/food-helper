from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4
import pytest
from fastapi import FastAPI, Depends, HTTPException, status
from httpx import ASGITransport, AsyncClient
import jwt

from app.api.dependencies import (
    get_current_user,
    get_current_active_user,
    require_roles,
    require_role,
    check_resource_ownership,
)
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserRegisterRequest, UserLoginRequest
from app.services.auth_service import AuthService
from app.main import app


# ==========================================
# 1. Argon2id Password Hashing Tests
# ==========================================

def test_argon2id_password_hashing():
    password = "SuperSecretPassword123!"
    hashed = get_password_hash(password)

    # Verify Argon2id hash format
    assert hashed.startswith("$argon2id$")
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(password, "invalid_hash_format") is False


# ==========================================
# 2. JWT Generation & Validation Tests
# ==========================================

def test_jwt_access_and_refresh_tokens():
    user_id = uuid4()
    role = UserRole.FOOD_BUSINESS

    # Access Token
    access_token = create_access_token(user_id=user_id, role=role)
    payload = decode_token(access_token, expected_type="access")
    assert payload["sub"] == str(user_id)
    assert payload["role"] == UserRole.FOOD_BUSINESS.value
    assert payload["type"] == "access"
    assert "exp" in payload
    assert "iat" in payload
    assert "jti" in payload

    # Refresh Token
    refresh_token = create_refresh_token(user_id=user_id, role=role)
    refresh_payload = decode_token(refresh_token, expected_type="refresh")
    assert refresh_payload["sub"] == str(user_id)
    assert refresh_payload["type"] == "refresh"

    # Reject refresh token when access token expected
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(refresh_token, expected_type="access")

    # Reject access token when refresh token expected
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(access_token, expected_type="refresh")


def test_jwt_expiration_and_malformed():
    user_id = uuid4()
    # Expired token
    expired_token = create_access_token(
        user_id=user_id,
        role=UserRole.VOLUNTEER,
        expires_delta=timedelta(seconds=-10),
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(expired_token)

    # Malformed token
    with pytest.raises(jwt.PyJWTError):
        decode_token("not.a.valid.jwt.token")


# ==========================================
# 3. RBAC & Ownership Dependency Tests
# ==========================================

@pytest.mark.asyncio
async def test_rbac_role_checker():
    donor_user = User(id=uuid4(), email="donor@test.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    org_user = User(id=uuid4(), email="org@test.com", role=UserRole.ORGANIZATION, is_active=True)
    admin_user = User(id=uuid4(), email="admin@test.com", role=UserRole.ADMIN, is_active=True)

    donor_guard = require_role(UserRole.FOOD_BUSINESS)
    multi_guard = require_roles(UserRole.FOOD_BUSINESS, UserRole.ORGANIZATION)

    # Allowed
    assert await donor_guard(current_user=donor_user) == donor_user
    assert await multi_guard(current_user=donor_user) == donor_user
    assert await multi_guard(current_user=org_user) == org_user

    # Forbidden
    with pytest.raises(HTTPException) as exc:
        await donor_guard(current_user=org_user)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN

    with pytest.raises(HTTPException) as exc:
        await donor_guard(current_user=admin_user)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_resource_ownership_check():
    owner_id = uuid4()
    other_id = uuid4()

    owner_user = User(id=owner_id, email="owner@test.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    other_user = User(id=other_id, email="other@test.com", role=UserRole.FOOD_BUSINESS, is_active=True)
    admin_user = User(id=uuid4(), email="admin@test.com", role=UserRole.ADMIN, is_active=True)

    # Owner access allowed
    check_resource_ownership(resource_owner_id=owner_id, current_user=owner_user)

    # Admin override allowed
    check_resource_ownership(resource_owner_id=owner_id, current_user=admin_user)

    # Other user denied
    with pytest.raises(HTTPException) as exc:
        check_resource_ownership(resource_owner_id=owner_id, current_user=other_user)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


# ==========================================
# 4. Auth Service Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_auth_service_registration():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    # Mock no existing user
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    reg_data = UserRegisterRequest(
        email="NewDonor@Kitchen.com",
        password="SecurePassword123!",
        role=UserRole.FOOD_BUSINESS,
    )

    user = await AuthService.register_user(db=db_mock, register_data=reg_data)
    assert user.email == "newdonor@kitchen.com"  # normalized
    assert user.role == UserRole.FOOD_BUSINESS
    assert user.is_active is True
    assert user.password_hash.startswith("$argon2id$")
    assert db_mock.add.called
    assert db_mock.commit.called


@pytest.mark.asyncio
async def test_auth_service_duplicate_email():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    existing_user = User(id=uuid4(), email="existing@test.com", role=UserRole.ORGANIZATION)
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_user
    db_mock.execute.return_value = exec_mock

    reg_data = UserRegisterRequest(
        email="existing@test.com",
        password="SecurePassword123!",
        role=UserRole.ORGANIZATION,
    )

    with pytest.raises(HTTPException) as exc:
        await AuthService.register_user(db=db_mock, register_data=reg_data)
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "already exists" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_auth_service_authentication_success_and_failures():
    user_id = uuid4()
    raw_pass = "ValidPassword123!"
    pass_hash = get_password_hash(raw_pass)

    active_user = User(id=user_id, email="donor@test.com", password_hash=pass_hash, role=UserRole.FOOD_BUSINESS, is_active=True)
    suspended_user = User(id=user_id, email="suspended@test.com", password_hash=pass_hash, role=UserRole.FOOD_BUSINESS, is_active=False)

    db_mock = AsyncMock()
    db_mock.add = MagicMock()

    # 1. Success
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = active_user
    db_mock.execute.return_value = exec_mock

    u, a_token, r_token, exp = await AuthService.authenticate_user(
        db=db_mock,
        login_data=UserLoginRequest(email="donor@test.com", password=raw_pass),
    )
    assert u.id == user_id
    assert a_token is not None
    assert r_token is not None

    # 2. Invalid password
    with pytest.raises(HTTPException) as exc:
        await AuthService.authenticate_user(
            db=db_mock,
            login_data=UserLoginRequest(email="donor@test.com", password="WrongPassword!"),
        )
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid email or password" in str(exc.value.detail)

    # 3. Nonexistent user
    exec_mock.scalar_one_or_none.return_value = None
    with pytest.raises(HTTPException) as exc:
        await AuthService.authenticate_user(
            db=db_mock,
            login_data=UserLoginRequest(email="nobody@test.com", password=raw_pass),
        )
    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid email or password" in str(exc.value.detail)

    # 4. Suspended account
    exec_mock.scalar_one_or_none.return_value = suspended_user
    with pytest.raises(HTTPException) as exc:
        await AuthService.authenticate_user(
            db=db_mock,
            login_data=UserLoginRequest(email="suspended@test.com", password=raw_pass),
        )
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN
    assert "suspended or inactive" in str(exc.value.detail)


# ==========================================
# 5. FastAPI HTTP API Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_api_get_me_unauthorized_and_authorized():
    user_id = uuid4()
    mock_user = User(
        id=user_id,
        email="auth_user@test.com",
        role=UserRole.FOOD_BUSINESS,
        is_active=True,
        is_verified=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    # 1. Unauthenticated -> 401 / 403
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        unauth_resp = await client.get("/api/v1/auth/me")
        assert unauth_resp.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    # 2. Authenticated with dependency override
    app.dependency_overrides[get_current_user] = lambda: mock_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            auth_resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer fake-token"},
            )
            assert auth_resp.status_code == 200
            data = auth_resp.json()
            assert data["email"] == "auth_user@test.com"
            assert data["role"] == "FOOD_BUSINESS"
            assert "password" not in data
            assert "password_hash" not in data
    finally:
        app.dependency_overrides.clear()
