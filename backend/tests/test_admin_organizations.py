from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from geoalchemy2.elements import WKTElement

from app.api.dependencies import get_current_user
from app.main import app
from app.models.enums import NotificationType, OrgType, OrgVerificationStatus, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.organization_service import OrganizationService


# Helper to build mock organization
def create_mock_org(
    org_id: UUID = None,
    user_id: UUID = None,
    org_name: str = "Hope Food Bank",
    verification_status: OrgVerificationStatus = OrgVerificationStatus.PENDING,
) -> Organization:
    user = User(
        id=user_id or uuid4(),
        email="contact@hopefoodbank.org",
        role=UserRole.ORGANIZATION,
        is_active=True,
        is_verified=False,
    )
    org = Organization(
        id=org_id or uuid4(),
        user_id=user.id,
        org_name=org_name,
        org_type=OrgType.FOOD_BANK,
        tax_id="TAX-998877",
        address_text="789 Community Road, Cityville",
        location=WKTElement("POINT(-122.4194 37.7749)", srid=4326),
        contact_phone="+1-555-888-9999",
        verification_status=verification_status,
        max_capacity_kg=Decimal("500.00"),
        current_capacity_kg=Decimal("120.00"),
        accepted_categories=["PREPARED_MEALS", "BAKERY", "PRODUCE"],
        can_pickup=True,
        operating_hours={"monday": {"open": "08:00", "close": "18:00"}},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    org.user = user
    return org


# ==========================================
# 1. RBAC & Security Access Tests
# ==========================================

@pytest.mark.asyncio
async def test_admin_organizations_unauthenticated_fails():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/admin/organizations")
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.asyncio
@pytest.mark.parametrize("disallowed_role", [
    UserRole.FOOD_BUSINESS,
    UserRole.ORGANIZATION,
    UserRole.VOLUNTEER,
])
async def test_admin_organizations_non_admin_roles_forbidden(disallowed_role):
    non_admin_user = User(
        id=uuid4(),
        email="user@test.local",
        role=disallowed_role,
        is_active=True,
    )

    app.dependency_overrides[get_current_user] = lambda: non_admin_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/organizations")
            assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


# ==========================================
# 2. Admin Organizations List & Detail Tests
# ==========================================

@pytest.mark.asyncio
async def test_admin_list_organizations_success():
    admin_user = User(
        id=uuid4(),
        email="admin@foodhelper.org",
        role=UserRole.ADMIN,
        is_active=True,
    )
    org1 = create_mock_org(org_name="City Shelter", verification_status=OrgVerificationStatus.PENDING)
    org2 = create_mock_org(org_name="Daily Bread Pantry", verification_status=OrgVerificationStatus.VERIFIED)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    with patch.object(OrganizationService, "list_admin_organizations", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [
            OrganizationService.get_admin_organization_by_id.__annotations__["return"]
        ]
        from app.schemas.organization import AdminOrganizationResponse
        resp1 = AdminOrganizationResponse.model_validate(org1)
        resp1.owner_email = org1.user.email
        resp1.is_active = org1.user.is_active
        resp2 = AdminOrganizationResponse.model_validate(org2)
        resp2.owner_email = org2.user.email
        resp2.is_active = org2.user.is_active
        mock_list.return_value = [resp1, resp2]

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/organizations?verification_status=PENDING&search=City")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert len(data) == 2
                assert data[0]["org_name"] == "City Shelter"
                assert data[0]["owner_email"] == "contact@hopefoodbank.org"
                assert data[0]["verification_status"] == "PENDING"
                assert data[1]["org_name"] == "Daily Bread Pantry"
                assert data[1]["verification_status"] == "VERIFIED"
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_get_organization_by_id_success_and_not_found():
    admin_user = User(
        id=uuid4(),
        email="admin@foodhelper.org",
        role=UserRole.ADMIN,
        is_active=True,
    )
    org = create_mock_org(org_name="Community Food Rescue", verification_status=OrgVerificationStatus.PENDING)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    with patch.object(OrganizationService, "get_admin_organization_by_id", new_callable=AsyncMock) as mock_get:
        from app.schemas.organization import AdminOrganizationResponse
        resp_obj = AdminOrganizationResponse.model_validate(org)
        resp_obj.owner_email = org.user.email
        resp_obj.is_active = org.user.is_active

        mock_get.return_value = resp_obj

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Existing
                resp = await client.get(f"/api/v1/admin/organizations/{org.id}")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert data["id"] == str(org.id)
                assert data["org_name"] == "Community Food Rescue"
                assert data["owner_email"] == "contact@hopefoodbank.org"

                # 2. Not found
                mock_get.return_value = None
                unknown_id = uuid4()
                resp_404 = await client.get(f"/api/v1/admin/organizations/{unknown_id}")
                assert resp_404.status_code == status.HTTP_404_NOT_FOUND
        finally:
            app.dependency_overrides.clear()


# ==========================================
# 3. Admin Verification & Rejection Actions
# ==========================================

@pytest.mark.asyncio
async def test_admin_verify_organization_endpoint():
    admin_user = User(
        id=uuid4(),
        email="admin@foodhelper.org",
        role=UserRole.ADMIN,
        is_active=True,
    )
    org = create_mock_org(verification_status=OrgVerificationStatus.VERIFIED)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    with patch.object(OrganizationService, "verify_organization", new_callable=AsyncMock) as mock_verify:
        from app.schemas.organization import AdminOrganizationResponse
        resp_obj = AdminOrganizationResponse.model_validate(org)
        resp_obj.owner_email = org.user.email
        resp_obj.is_active = org.user.is_active
        mock_verify.return_value = resp_obj

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/api/v1/admin/organizations/{org.id}/verify")
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert data["verification_status"] == "VERIFIED"
                mock_verify.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_reject_organization_endpoint():
    admin_user = User(
        id=uuid4(),
        email="admin@foodhelper.org",
        role=UserRole.ADMIN,
        is_active=True,
    )
    org = create_mock_org(verification_status=OrgVerificationStatus.REJECTED)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    with patch.object(OrganizationService, "reject_organization", new_callable=AsyncMock) as mock_reject:
        from app.schemas.organization import AdminOrganizationResponse
        resp_obj = AdminOrganizationResponse.model_validate(org)
        resp_obj.owner_email = org.user.email
        resp_obj.is_active = org.user.is_active
        mock_reject.return_value = resp_obj

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Valid rejection
                resp = await client.post(
                    f"/api/v1/admin/organizations/{org.id}/reject",
                    json={"reason": "Invalid or expired 501(c)(3) tax exemption document provided."},
                )
                assert resp.status_code == status.HTTP_200_OK
                data = resp.json()
                assert data["verification_status"] == "REJECTED"

                # 2. Validation error on empty reason
                resp_invalid = await client.post(
                    f"/api/v1/admin/organizations/{org.id}/reject",
                    json={"reason": "no"},
                )
                assert resp_invalid.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        finally:
            app.dependency_overrides.clear()


# ==========================================
# 4. Service-Level Audit & Notification Tests
# ==========================================

@pytest.mark.asyncio
async def test_service_verify_organization_creates_audit_and_notification():
    admin_user = User(id=uuid4(), email="admin@foodhelper.org", role=UserRole.ADMIN, is_active=True)
    org = create_mock_org(verification_status=OrgVerificationStatus.PENDING)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = org
    db_mock.execute.return_value = exec_mock
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()

    added_entities = []
    db_mock.add = MagicMock(side_effect=lambda e: added_entities.append(e))

    with patch("app.services.organization_service.NotificationService.create_notification", new_callable=AsyncMock) as mock_notify:
        res = await OrganizationService.verify_organization(
            db=db_mock,
            organization_id=org.id,
            admin_user=admin_user,
            ip_address="192.168.1.50",
        )

        assert res.verification_status == OrgVerificationStatus.VERIFIED
        assert res.owner_email == "contact@hopefoodbank.org"
        assert res.is_active is True
        db_mock.commit.assert_awaited_once()

        # Check audit log
        audit_entries = [e for e in added_entities if getattr(e, "__tablename__", "") == "audit_logs"]
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "ORGANIZATION_VERIFIED"
        assert audit_entries[0].actor_id == admin_user.id
        assert audit_entries[0].new_state["verification_status"] == "VERIFIED"

        # Check notification
        mock_notify.assert_awaited_once_with(
            db=db_mock,
            recipient_id=org.user_id,
            title="Organization Account Verified",
            message="Your relief organization 'Hope Food Bank' has been verified by an administrator. You can now receive donation match offers.",
            notification_type=NotificationType.VERIFICATION_STATUS_CHANGED,
            related_entity_type="organization",
            related_entity_id=org.id,
        )


@pytest.mark.asyncio
async def test_service_verify_organization_idempotent():
    admin_user = User(id=uuid4(), email="admin@foodhelper.org", role=UserRole.ADMIN, is_active=True)
    org = create_mock_org(verification_status=OrgVerificationStatus.VERIFIED)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = org
    db_mock.execute.return_value = exec_mock
    db_mock.commit = AsyncMock()
    db_mock.add = MagicMock()

    res = await OrganizationService.verify_organization(
        db=db_mock,
        organization_id=org.id,
        admin_user=admin_user,
    )

    assert res.verification_status == OrgVerificationStatus.VERIFIED
    db_mock.add.assert_not_called()
    db_mock.commit.assert_not_called()


@pytest.mark.asyncio
async def test_service_reject_organization_creates_audit_and_notification():
    admin_user = User(id=uuid4(), email="admin@foodhelper.org", role=UserRole.ADMIN, is_active=True)
    org = create_mock_org(verification_status=OrgVerificationStatus.PENDING)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = org
    db_mock.execute.return_value = exec_mock
    db_mock.commit = AsyncMock()
    db_mock.refresh = AsyncMock()

    added_entities = []
    db_mock.add = MagicMock(side_effect=lambda e: added_entities.append(e))

    with patch("app.services.organization_service.NotificationService.create_notification", new_callable=AsyncMock) as mock_notify:
        reason = "Non-profit charity certificate could not be validated with state registry."
        res = await OrganizationService.reject_organization(
            db=db_mock,
            organization_id=org.id,
            admin_user=admin_user,
            reason=reason,
            ip_address="192.168.1.50",
        )

        assert res.verification_status == OrgVerificationStatus.REJECTED
        db_mock.commit.assert_awaited_once()

        # Check audit log
        audit_entries = [e for e in added_entities if getattr(e, "__tablename__", "") == "audit_logs"]
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "ORGANIZATION_REJECTED"
        assert audit_entries[0].actor_id == admin_user.id
        assert audit_entries[0].new_state["verification_status"] == "REJECTED"
        assert audit_entries[0].new_state["reason"] == reason

        # Check notification
        mock_notify.assert_awaited_once_with(
            db=db_mock,
            recipient_id=org.user_id,
            title="Organization Verification Application Rejected",
            message=f"Your organization 'Hope Food Bank' verification application was rejected. Reason: {reason}",
            notification_type=NotificationType.VERIFICATION_STATUS_CHANGED,
            related_entity_type="organization",
            related_entity_id=org.id,
        )
