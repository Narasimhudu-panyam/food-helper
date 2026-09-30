from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, ConfigDict, Field, model_validator

T = TypeVar("T")


class LocationCoordinates(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in degrees (-90.0 to 90.0)",
        examples=[17.385044],
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in degrees (-180.0 to 180.0)",
        examples=[78.486671],
    )

    @model_validator(mode="before")
    @classmethod
    def parse_from_geo(cls, data: Any) -> Any:
        if data is None:
            return data
        # Handle GeoAlchemy2 WKBElement or WKTElement
        if hasattr(data, "data") or "WKBElement" in str(type(data)):
            try:
                from geoalchemy2.shape import to_shape
                point = to_shape(data)
                return {"latitude": point.y, "longitude": point.x}
            except Exception:
                pass
        return data


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, description="Page number starting at 1")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int = Field(..., ge=0, description="Total number of items")
    page: int = Field(..., ge=1, description="Current page")
    page_size: int = Field(..., ge=1, description="Items per page")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
