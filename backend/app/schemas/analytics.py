from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AnalyticsSummary(BaseModel):
    total_donations: int = Field(0, description="Total count of donations in scope")
    active_donations: int = Field(0, description="Count of currently active/in-progress donations")
    delivered_donations: int = Field(0, description="Count of completed/delivered donations")
    cancelled_donations: int = Field(0, description="Count of cancelled donations")
    total_weight_kg_donated: float = Field(0.0, description="Total physical weight in kg of all created donations")
    total_weight_kg_delivered: float = Field(0.0, description="Total physical weight in kg of successfully delivered donations")
    total_pickups: int = Field(0, description="Total pickups created in scope")
    active_pickups: int = Field(0, description="Active pickups currently in progress")
    delivered_pickups: int = Field(0, description="Successfully delivered pickups")
    failed_pickups: int = Field(0, description="Failed pickup attempts")


class MatchingAnalytics(BaseModel):
    total_matches: int = Field(0, description="Total matches generated in scope")
    accepted_matches: int = Field(0, description="Accepted match offers")
    declined_matches: int = Field(0, description="Declined match offers")
    acceptance_rate: float = Field(0.0, description="Match acceptance percentage: accepted / (accepted + declined) * 100")
    avg_distance_km: float = Field(0.0, description="Average matching distance in kilometers")
    avg_match_score: float = Field(0.0, description="Average algorithmic match score (0-100)")


class CategoryDistribution(BaseModel):
    category: str = Field(..., description="Food category enum value")
    count: int = Field(0, description="Number of donations in this category")
    total_weight_kg: float = Field(0.0, description="Total weight in kg for this category")


class TrendDataPoint(BaseModel):
    date: str = Field(..., description="Date string YYYY-MM-DD")
    donations_count: int = Field(0, description="Donations created on this day")
    delivered_count: int = Field(0, description="Donations/pickups delivered on this day")
    weight_kg_donated: float = Field(0.0, description="Total kg donated on this day")
    weight_kg_delivered: float = Field(0.0, description="Total kg delivered on this day")


class AnalyticsOverviewResponse(BaseModel):
    role: str = Field(..., description="Authenticated user role")
    time_range: str = Field(..., description="Active time range filter (7d, 30d, 90d, all)")
    summary: AnalyticsSummary = Field(..., description="Aggregated operational summary KPIs")
    matching: MatchingAnalytics = Field(..., description="Algorithmic and operational match metrics")
    categories: List[CategoryDistribution] = Field(default_factory=list, description="Category distribution breakdown")
    trends: List[TrendDataPoint] = Field(default_factory=list, description="Chronological trend timeseries")
    role_metrics: Dict[str, Any] = Field(default_factory=dict, description="Role-specific KPIs and operational context")
