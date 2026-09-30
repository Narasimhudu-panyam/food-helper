import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import UUID, uuid4
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.websocket_manager import ws_manager
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.schemas.notification import NotificationResponse


class NotificationService:
    """
    Database-backed, tenant-isolated notification service
    with real-time WebSocket delivery support.
    """

    @staticmethod
    async def create_notification(
        db: AsyncSession,
        recipient_id: UUID,
        title: str,
        message: str,
        notification_type: NotificationType,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[UUID] = None,
        push_realtime: bool = True,
    ) -> Notification:
        """
        Create and persist a business notification in the database.
        Optionally dispatches a best-effort real-time message to active WebSocket connections.
        """
        now = datetime.now(timezone.utc)
        notification = Notification(
            id=uuid4(),
            recipient_id=recipient_id,
            title=title,
            message=message,
            notification_type=notification_type,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            is_read=False,
            read_at=None,
            created_at=now,
        )

        db.add(notification)
        await db.flush()

        if push_realtime:
            # Prepare payload for real-time dispatch
            payload = {
                "type": "notification",
                "notification": {
                    "id": str(notification.id),
                    "recipient_id": str(notification.recipient_id),
                    "title": notification.title,
                    "message": notification.message,
                    "notification_type": notification.notification_type.value,
                    "related_entity_type": notification.related_entity_type,
                    "related_entity_id": str(notification.related_entity_id) if notification.related_entity_id else None,
                    "is_read": notification.is_read,
                    "read_at": notification.read_at.isoformat() if notification.read_at else None,
                    "created_at": notification.created_at.isoformat(),
                },
            }
            # Asynchronously send without blocking DB operations
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(ws_manager.send_personal_message(recipient_id, payload))
            except RuntimeError:
                # If no running loop in current context, pass
                pass

        return notification

    @staticmethod
    async def list_notifications_for_user(
        db: AsyncSession,
        user_id: UUID,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Notification], int, int]:
        """
        Retrieve paginated notifications exclusively for the authenticated user.
        Returns (items, total_matching, unread_count).
        """
        # Base query for user items
        base_where = [Notification.recipient_id == user_id]
        if unread_only:
            base_where.append(Notification.is_read.is_(False))

        # Total matching count
        stmt_count = select(func.count(Notification.id)).where(*base_where)
        res_count = await db.execute(stmt_count)
        total_matching = res_count.scalar_one() or 0

        # Total unread count for user regardless of filter
        stmt_unread = select(func.count(Notification.id)).where(
            Notification.recipient_id == user_id,
            Notification.is_read.is_(False),
        )
        res_unread = await db.execute(stmt_unread)
        unread_count = res_unread.scalar_one() or 0

        # Items page
        stmt_items = (
            select(Notification)
            .where(*base_where)
            .order_by(desc(Notification.created_at))
            .offset(offset)
            .limit(limit)
        )
        res_items = await db.execute(stmt_items)
        items = list(res_items.scalars().all())

        return items, total_matching, unread_count

    @staticmethod
    async def get_unread_count(db: AsyncSession, user_id: UUID) -> int:
        """Get the count of unread notifications for a user."""
        stmt = select(func.count(Notification.id)).where(
            Notification.recipient_id == user_id,
            Notification.is_read.is_(False),
        )
        res = await db.execute(stmt)
        return res.scalar_one() or 0

    @staticmethod
    async def get_notification_by_id(
        db: AsyncSession,
        user_id: UUID,
        notification_id: UUID,
    ) -> Notification:
        """
        Retrieve a single notification by ID with strict tenant ownership enforcement.
        """
        stmt = select(Notification).where(Notification.id == notification_id)
        res = await db.execute(stmt)
        notification = res.scalar_one_or_none()

        if not notification:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found.",
            )

        if notification.recipient_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this notification.",
            )

        return notification

    @staticmethod
    async def mark_as_read(
        db: AsyncSession,
        user_id: UUID,
        notification_id: UUID,
    ) -> Notification:
        """
        Mark a notification as read idempotently.
        """
        notification = await NotificationService.get_notification_by_id(db, user_id, notification_id)

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(notification)

        return notification

    @staticmethod
    async def mark_all_as_read(
        db: AsyncSession,
        user_id: UUID,
    ) -> int:
        """
        Mark all unread notifications belonging to the user as read in a single query.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(
                Notification.recipient_id == user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=now)
        )
        res = await db.execute(stmt)
        await db.commit()
        return res.rowcount or 0
