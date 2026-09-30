from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import NotificationType


class NotificationMarkReadRequest(BaseModel):
    is_read: bool = Field(
        default=True,
        description="Mark notification as read or unread",
    )


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recipient_id: UUID
    title: str
    message: str
    notification_type: NotificationType
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[UUID] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int = Field(..., description="Total matching notifications count")
    unread_count: int = Field(..., description="Total unread notifications count for user")
    items: List[NotificationResponse] = Field(default_factory=list, description="List of notification items")


class UnreadCountResponse(BaseModel):
    unread_count: int = Field(..., description="Count of unread notifications")


class BatchMarkReadResponse(BaseModel):
    updated_count: int = Field(..., description="Number of notifications marked as read")


class WebSocketNotificationMessage(BaseModel):
    type: str = Field(default="notification", description="WebSocket message category")
    notification: NotificationResponse

