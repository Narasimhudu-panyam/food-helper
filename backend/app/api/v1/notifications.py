import logging
from typing import Optional
from uuid import UUID
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import AsyncSessionLocal, get_async_db
from app.core.security import decode_token
from app.core.websocket_manager import ws_manager
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    BatchMarkReadResponse,
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List role-scoped notifications for the authenticated user",
)
async def list_notifications(
    unread_only: bool = Query(False, description="Filter for unread notifications only"),
    limit: int = Query(50, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> NotificationListResponse:
    items, total, unread_count = await NotificationService.list_notifications_for_user(
        db=db,
        user_id=current_user.id,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )
    return NotificationListResponse(
        total=total,
        unread_count=unread_count,
        items=[NotificationResponse.model_validate(n) for n in items],
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    summary="Get unread notification count for the authenticated user",
)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> UnreadCountResponse:
    count = await NotificationService.get_unread_count(db=db, user_id=current_user.id)
    return UnreadCountResponse(unread_count=count)


@router.get(
    "/{notification_id}",
    response_model=NotificationResponse,
    summary="Retrieve details of a specific notification with tenant isolation",
)
async def get_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> NotificationResponse:
    notification = await NotificationService.get_notification_by_id(
        db=db,
        user_id=current_user.id,
        notification_id=notification_id,
    )
    return NotificationResponse.model_validate(notification)


@router.post(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark a specific notification as read idempotently",
)
async def mark_notification_as_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> NotificationResponse:
    notification = await NotificationService.mark_as_read(
        db=db,
        user_id=current_user.id,
        notification_id=notification_id,
    )
    return NotificationResponse.model_validate(notification)


@router.post(
    "/read-all",
    response_model=BatchMarkReadResponse,
    summary="Mark all unread notifications as read for the authenticated user",
)
async def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> BatchMarkReadResponse:
    updated_count = await NotificationService.mark_all_as_read(
        db=db,
        user_id=current_user.id,
    )
    return BatchMarkReadResponse(updated_count=updated_count)


@router.websocket("/ws")
async def websocket_notifications_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
) -> None:
    """
    WebSocket endpoint for real-time notification push.
    Authenticates user via query parameter JWT token before connection registration.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing authentication token")
        return

    try:
        payload = decode_token(token, expected_type="access")
        user_id = UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
        return

    # Verify user exists and is active in database
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.id == user_id)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()
        if not user or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized or inactive user")
            return

    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            # Keep-alive / message loop
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning("WebSocket error for user %s: %s", user_id, e)
        ws_manager.disconnect(user_id, websocket)
