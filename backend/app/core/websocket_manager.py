import logging
from collections import defaultdict
from typing import Any, Dict, Set
from uuid import UUID
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    In-memory WebSocket connection manager for real-time notification push.

    NOTE ON MULTI-PROCESS / HORIZONTAL SCALING:
    This connection manager tracks active client WebSockets in-process memory.
    In a single-instance or worker process, it dispatches events directly.
    For multi-worker or multi-instance deployments, a distributed pub/sub broker
    (e.g., Redis Pub/Sub, RabbitMQ, or Postgres LISTEN/NOTIFY) can be bridged in
    without changing client message contracts or database persistence models.
    PostgreSQL remains the durable source of truth.
    """

    def __init__(self) -> None:
        self._active_connections: Dict[UUID, Set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        """Accept incoming WebSocket connection and register under the authenticated user ID."""
        await websocket.accept()
        self._active_connections[user_id].add(websocket)
        logger.debug("WebSocket connected for user %s. Total sockets for user: %d", user_id, len(self._active_connections[user_id]))

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        """Unregister a disconnected WebSocket connection."""
        if user_id in self._active_connections:
            self._active_connections[user_id].discard(websocket)
            if not self._active_connections[user_id]:
                del self._active_connections[user_id]
        logger.debug("WebSocket disconnected for user %s", user_id)

    async def send_personal_message(self, user_id: UUID, message: Dict[str, Any]) -> None:
        """
        Best-effort real-time message delivery to all active connections belonging to user_id.
        Delivery failures do NOT affect the caller or database transaction.
        """
        if user_id not in self._active_connections:
            return

        dead_connections = set()
        for websocket in list(self._active_connections[user_id]):
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning("Failed to send WebSocket message to user %s: %s", user_id, e)
                dead_connections.add(websocket)

        for dead_ws in dead_connections:
            self.disconnect(user_id, dead_ws)


# Global singleton manager instance
ws_manager = ConnectionManager()
