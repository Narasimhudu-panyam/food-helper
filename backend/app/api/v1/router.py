from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.businesses import router as businesses_router
from app.api.v1.donations import router as donations_router
from app.api.v1.matches import router as matches_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.pickups import router as pickups_router
from app.api.v1.volunteers import router as volunteers_router
from app.api.v1.analytics import router as analytics_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(businesses_router)
api_v1_router.include_router(donations_router)
api_v1_router.include_router(matches_router)
api_v1_router.include_router(notifications_router)
api_v1_router.include_router(organizations_router)
api_v1_router.include_router(pickups_router)
api_v1_router.include_router(volunteers_router)
api_v1_router.include_router(analytics_router)
