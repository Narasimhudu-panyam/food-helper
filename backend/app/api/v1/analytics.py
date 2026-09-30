from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_active_user
from app.core.database import get_async_db
from app.models.user import User
from app.schemas.analytics import AnalyticsOverviewResponse
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics & Impact"])


@router.get(
    "/overview",
    response_model=AnalyticsOverviewResponse,
    summary="Get authoritative role-scoped analytics overview",
    description="Calculates live operational metrics, matching statistics, food category distributions, and daily trends based on JWT user role and permissions.",
)
async def get_analytics_overview(
    time_range: str = Query("30d", description="Time range: 7d, 30d, 90d, all"),
    start_date: Optional[datetime] = Query(None, description="Optional custom start UTC datetime"),
    end_date: Optional[datetime] = Query(None, description="Optional custom end UTC datetime"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db),
) -> AnalyticsOverviewResponse:
    return await AnalyticsService.get_overview(
        db=db,
        current_user=current_user,
        time_range=time_range,
        start_date=start_date,
        end_date=end_date,
    )
