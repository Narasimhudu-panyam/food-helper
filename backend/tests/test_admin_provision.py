from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest

from app.core.security import get_password_hash, verify_password
from app.models.enums import UserRole
from app.models.user import User
from app.services.admin_provision_service import AdminProvisionService


# ==========================================
# 1. Admin Email Validation Tests
# ==========================================

def test_validate_admin_email_valid():
    valid_emails = [
        "admin@foodhelper.org",
        "ADMIN@DOMAIN.COM",
        "  super.admin+food@helper.co.uk  ",
    ]
    for email in valid_emails:
        normalized = AdminProvisionService.validate_admin_email(email)
        assert normalized == email.strip().lower()
        assert "@" in normalized


def test_validate_admin_email_invalid():
    invalid_emails = [
        "",
        "   ",
        "not-an-email",
        "@nodomain.com",
        "noat.com",
        None,
    ]
    for email in invalid_emails:
        with pytest.raises(ValueError):
            AdminProvisionService.validate_admin_email(email)


# ==========================================
# 2. Admin Password Validation Tests
# ==========================================

def test_validate_admin_password_valid():
    valid_passwords = [
        "SuperSecretAdmin123!",
        "a" * 8,
        "a" * 128,
    ]
    for password in valid_passwords:
        res = AdminProvisionService.validate_admin_password(password)
        assert res == password


def test_validate_admin_password_invalid():
    invalid_passwords = [
        "",
        "short",
        "1234567",
        "a" * 129,
        None,
    ]
    for password in invalid_passwords:
        with pytest.raises(ValueError):
            AdminProvisionService.validate_admin_password(password)


# ==========================================
# 3. Provision Admin Service Tests
# ==========================================

@pytest.mark.asyncio
async def test_provision_admin_creates_new_admin():
    db_mock = AsyncMock()
    # Mock no existing user
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock

    added_users = []
    def mock_add(user):
        user.id = uuid4()
        added_users.append(user)

    db_mock.add = MagicMock(side_effect=mock_add)
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()

    raw_password = "AdminSecurePassword123!"
    admin_user, created = await AdminProvisionService.provision_admin(
        db=db_mock,
        email="Admin@FoodHelper.org",
        password=raw_password,
    )

    assert created is True
    assert admin_user.email == "admin@foodhelper.org"
    assert admin_user.role == UserRole.ADMIN
    assert admin_user.is_active is True
    assert admin_user.is_verified is True
    assert admin_user.password_hash.startswith("$argon2id$")
    assert verify_password(raw_password, admin_user.password_hash) is True
    assert len(added_users) == 1
    db_mock.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_provision_admin_idempotent_existing_admin():
    existing_admin = User(
        id=uuid4(),
        email="admin@foodhelper.org",
        password_hash=get_password_hash("ExistingPassword123!"),
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_admin
    db_mock.execute.return_value = exec_mock
    db_mock.add = MagicMock()
    db_mock.commit = AsyncMock()

    user, created = await AdminProvisionService.provision_admin(
        db=db_mock,
        email="admin@foodhelper.org",
        password="NewAttemptedPassword123!",
    )

    assert created is False
    assert user.id == existing_admin.id
    assert user.role == UserRole.ADMIN
    db_mock.add.assert_not_called()
    db_mock.commit.assert_not_called()


@pytest.mark.asyncio
async def test_provision_admin_refuses_to_overwrite_non_admin_user():
    existing_business = User(
        id=uuid4(),
        email="donor@bakery.com",
        password_hash=get_password_hash("BusinessPassword123!"),
        role=UserRole.FOOD_BUSINESS,
        is_active=True,
        is_verified=True,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_business
    db_mock.execute.return_value = exec_mock

    with pytest.raises(ValueError) as exc:
        await AdminProvisionService.provision_admin(
            db=db_mock,
            email="donor@bakery.com",
            password="SomePassword123!",
        )

    assert "already exists with role 'FOOD_BUSINESS'" in str(exc.value)
    assert "Refusing to overwrite" in str(exc.value)


@pytest.mark.asyncio
async def test_provision_admin_promotes_existing_non_admin_user():
    existing_user = User(
        id=uuid4(),
        email="volunteer@delivery.com",
        password_hash=get_password_hash("OldPassword123!"),
        role=UserRole.VOLUNTEER,
        is_active=True,
        is_verified=False,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = existing_user
    db_mock.execute.return_value = exec_mock
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()

    new_pass = "NewAdminPassword123!"
    user, created = await AdminProvisionService.provision_admin(
        db=db_mock,
        email="volunteer@delivery.com",
        password=new_pass,
        promote_existing=True,
    )

    assert created is True
    assert user.role == UserRole.ADMIN
    assert user.is_verified is True
    assert verify_password(new_pass, user.password_hash) is True
    db_mock.commit.assert_awaited_once()
