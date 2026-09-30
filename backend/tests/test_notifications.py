import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from starlette.websockets import WebSocketDisconnect

from app.api.dependencies import get_current_user
from app.core.database import get_async_db
from app.core.security import create_access_token
from app.core.websocket_manager import ConnectionManager, ws_manager
from app.main import app
from app.models.enums import NotificationType, UserRole
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationResponse
from app.services.notification_service import NotificationService


# ==========================================
# 1. NotificationService Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_create_notification_success():
    recipient_id = uuid4()
    related_id = uuid4()

    db_mock = AsyncMock()
    added = []
    db_mock.add = MagicMock(side_effect=lambda obj: added.append(obj))

    with patch.object(ws_manager, "send_personal_message", new_callable=AsyncMock) as mock_send_ws:
        notification = await NotificationService.create_notification(
            db=db_mock,
            recipient_id=recipient_id,
            title="New Match Available",
            message="Your donation has been matched with Downtown Food Bank",
            notification_type=NotificationType.MATCH_INVITATION,
            related_entity_type="donation_match",
            related_entity_id=related_id,
            push_realtime=True,
        )

        assert notification.recipient_id == recipient_id
        assert notification.title == "New Match Available"
        assert notification.notification_type == NotificationType.MATCH_INVITATION
        assert notification.related_entity_type == "donation_match"
        assert notification.related_entity_id == related_id
        assert notification.is_read is False
        assert notification.read_at is None
        assert db_mock.flush.called
        assert len(added) == 1
        assert added[0] == notification


@pytest.mark.asyncio
async def test_list_notifications_for_user():
    user_id = uuid4()
    n1 = Notification(
        id=uuid4(),
        recipient_id=user_id,
        title="N1",
        message="M1",
        notification_type=NotificationType.MATCH_INVITATION,
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )
    n2 = Notification(
        id=uuid4(),
        recipient_id=user_id,
        title="N2",
        message="M2",
        notification_type=NotificationType.PICKUP_ASSIGNED,
        is_read=True,
        created_at=datetime.now(timezone.utc),
    )

    db_mock = AsyncMock()
    exec_mock_count = MagicMock()
    exec_mock_count.scalar_one.return_value = 2

    exec_mock_unread = MagicMock()
    exec_mock_unread.scalar_one.return_value = 1

    exec_mock_items = MagicMock()
    exec_mock_items.scalars.return_value.all.return_value = [n1, n2]

    db_mock.execute.side_effect = [exec_mock_count, exec_mock_unread, exec_mock_items]

    items, total, unread_count = await NotificationService.list_notifications_for_user(
        db=db_mock,
        user_id=user_id,
        unread_only=False,
        limit=10,
        offset=0,
    )

    assert total == 2
    assert unread_count == 1
    assert len(items) == 2


@pytest.mark.asyncio
async def test_get_unread_count():
    user_id = uuid4()
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one.return_value = 5
    db_mock.execute.return_value = exec_mock

    count = await NotificationService.get_unread_count(db_mock, user_id)
    assert count == 5


@pytest.mark.asyncio
async def test_get_notification_by_id_success_and_tenant_isolation():
    user_a = uuid4()
    user_b = uuid4()
    notif_id = uuid4()

    notification = Notification(
        id=notif_id,
        recipient_id=user_a,
        title="Alert",
        message="Msg",
        notification_type=NotificationType.DONATION_DELIVERED,
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )

    db_mock = AsyncMock()

    # 1. Success for user_a
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = notification
    db_mock.execute.return_value = exec_mock

    res = await NotificationService.get_notification_by_id(db_mock, user_a, notif_id)
    assert res.id == notif_id
    assert res.recipient_id == user_a

    # 2. Forbidden 403 for user_b
    with pytest.raises(HTTPException) as exc_403:
        await NotificationService.get_notification_by_id(db_mock, user_b, notif_id)
    assert exc_403.value.status_code == status.HTTP_403_FORBIDDEN

    # 3. Not Found 404
    exec_mock_none = MagicMock()
    exec_mock_none.scalar_one_or_none.return_value = None
    db_mock.execute.return_value = exec_mock_none

    with pytest.raises(HTTPException) as exc_404:
        await NotificationService.get_notification_by_id(db_mock, user_a, uuid4())
    assert exc_404.value.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_mark_as_read_idempotency():
    user_id = uuid4()
    notif_id = uuid4()

    notification = Notification(
        id=notif_id,
        recipient_id=user_id,
        title="Alert",
        message="Msg",
        notification_type=NotificationType.DONATION_DELIVERED,
        is_read=False,
        read_at=None,
        created_at=datetime.now(timezone.utc),
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = notification
    db_mock.execute.return_value = exec_mock

    # First mark: transitions from False to True
    res = await NotificationService.mark_as_read(db_mock, user_id, notif_id)
    assert res.is_read is True
    assert res.read_at is not None
    assert db_mock.commit.called
    assert db_mock.refresh.called

    # Second mark (idempotent): already True, does not recommit
    db_mock.commit.reset_mock()
    res2 = await NotificationService.mark_as_read(db_mock, user_id, notif_id)
    assert res2.is_read is True
    assert not db_mock.commit.called


@pytest.mark.asyncio
async def test_mark_all_as_read():
    user_id = uuid4()
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.rowcount = 4
    db_mock.execute.return_value = exec_mock

    updated = await NotificationService.mark_all_as_read(db_mock, user_id)
    assert updated == 4
    assert db_mock.commit.called


# ==========================================
# 2. ConnectionManager Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_websocket_connection_manager():
    mgr = ConnectionManager()
    user1 = uuid4()
    user2 = uuid4()

    ws1 = AsyncMock()
    ws2 = AsyncMock()
    ws3 = AsyncMock()

    # Connect
    await mgr.connect(user1, ws1)
    await mgr.connect(user1, ws2)
    await mgr.connect(user2, ws3)

    assert ws1.accept.called
    assert ws2.accept.called
    assert ws3.accept.called
    assert len(mgr._active_connections[user1]) == 2
    assert len(mgr._active_connections[user2]) == 1

    # Send personal message to user1
    payload = {"type": "notification", "test": "data"}
    await mgr.send_personal_message(user1, payload)
    ws1.send_json.assert_called_once_with(payload)
    ws2.send_json.assert_called_once_with(payload)
    assert not ws3.send_json.called

    # Disconnect one socket of user1
    mgr.disconnect(user1, ws1)
    assert len(mgr._active_connections[user1]) == 1

    # Disconnect remaining socket of user1 -> user key removed
    mgr.disconnect(user1, ws2)
    assert user1 not in mgr._active_connections

    # Handle failing socket gracefully
    ws3.send_json.side_effect = RuntimeError("Socket disconnected unexpectedly")
    await mgr.send_personal_message(user2, payload)
    # The failed socket should be automatically pruned
    assert user2 not in mgr._active_connections


# ==========================================
# 3. REST API Endpoint & Tenant RBAC Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_list_notifications():
    user_id = uuid4()
    current_user = User(id=user_id, email="donor@bistro.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    notif = Notification(
        id=uuid4(),
        recipient_id=user_id,
        title="Offer Accepted",
        message="Your donation was accepted",
        notification_type=NotificationType.MATCH_ACCEPTED,
        is_read=False,
        read_at=None,
        created_at=datetime.now(timezone.utc),
    )

    db_mock = AsyncMock()
    exec_count = MagicMock()
    exec_count.scalar_one.return_value = 1
    exec_unread = MagicMock()
    exec_unread.scalar_one.return_value = 1
    exec_items = MagicMock()
    exec_items.scalars.return_value.all.return_value = [notif]

    db_mock.execute.side_effect = [exec_count, exec_unread, exec_items]

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/notifications", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            data = resp.json()
            assert data["total"] == 1
            assert data["unread_count"] == 1
            assert len(data["items"]) == 1
            assert data["items"][0]["title"] == "Offer Accepted"
            assert data["items"][0]["notification_type"] == "MATCH_ACCEPTED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_unread_count():
    user_id = uuid4()
    current_user = User(id=user_id, email="vol@city.org", role=UserRole.VOLUNTEER, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one.return_value = 3
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/notifications/unread-count", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            assert resp.json()["unread_count"] == 3
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_and_read_notification_tenant_isolation():
    user_a = User(id=uuid4(), email="userA@test.com", role=UserRole.ORGANIZATION, is_active=True)
    user_b_id = uuid4()
    notif_id = uuid4()

    # Notification belongs to user_b
    notif = Notification(
        id=notif_id,
        recipient_id=user_b_id,
        title="Private Update",
        message="Secret info",
        notification_type=NotificationType.SYSTEM_ALERT,
        is_read=False,
        read_at=None,
        created_at=datetime.now(timezone.utc),
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = notif
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: user_a
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Attempt GET on user_b's notification by user_a -> 403 Forbidden
            resp = await client.get(f"/api/v1/notifications/{notif_id}", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_403_FORBIDDEN

            # 2. Attempt POST mark-read on user_b's notification by user_a -> 403 Forbidden
            resp_read = await client.post(f"/api/v1/notifications/{notif_id}/read", headers={"Authorization": "Bearer token"})
            assert resp_read.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_mark_all_read():
    user_id = uuid4()
    current_user = User(id=user_id, email="admin@matcher.org", role=UserRole.ADMIN, is_active=True)

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.rowcount = 7
    db_mock.execute.return_value = exec_mock

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/notifications/read-all", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            assert resp.json()["updated_count"] == 7
    finally:
        app.dependency_overrides.clear()


# ==========================================
# 4. WebSocket Endpoint Authentication Tests
# ==========================================

def test_websocket_missing_token_rejected():
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/v1/notifications/ws"):
            pass
    assert exc.value.code == status.WS_1008_POLICY_VIOLATION


def test_websocket_invalid_token_rejected():
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/v1/notifications/ws?token=invalid.jwt.token"):
            pass
    assert exc.value.code == status.WS_1008_POLICY_VIOLATION


def test_websocket_valid_token_connection_and_ping_pong():
    user_id = uuid4()
    token = create_access_token(user_id=user_id, role=UserRole.FOOD_BUSINESS)

    user = User(id=user_id, email="ws_user@bistro.com", role=UserRole.FOOD_BUSINESS, is_active=True)

    # Mock DB lookup in WebSocket endpoint
    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = user
    db_mock.execute.return_value = exec_mock

    with patch("app.api.v1.notifications.AsyncSessionLocal") as session_ctx:
        session_ctx.return_value.__aenter__.return_value = db_mock

        client = TestClient(app)
        with client.websocket_connect(f"/api/v1/notifications/ws?token={token}") as ws:
            # Send ping, verify pong
            ws.send_text("ping")
            response = ws.receive_text()
            assert response == "pong"
