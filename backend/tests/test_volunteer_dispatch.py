from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import pytest
from fastapi import HTTPException, status
from httpx import ASGITransport, AsyncClient
from geoalchemy2.elements import WKTElement

from app.api.dependencies import get_current_user
from app.core.database import get_async_db
from app.main import app
from app.models.audit import AuditLog
from app.models.business import FoodBusiness
from app.models.donation import Donation
from app.models.enums import (
    DonationStatus,
    FoodCategory,
    PickupStatus,
    QuantityUnit,
    StorageCondition,
    TransportMode,
    UserRole,
    VehicleType,
)
from app.models.organization import Organization
from app.models.pickup import Pickup
from app.models.user import User
from app.models.volunteer import Volunteer
from app.schemas.pickup import (
    PickupAssignVolunteerRequest,
    PickupVolunteerMatchListResponse,
)
from app.services.pickup_service import PickupService
from app.services.volunteer_dispatch_service import VolunteerDispatchService


# ==========================================
# 1. Deterministic Scoring Unit Tests
# ==========================================

def test_volunteer_scoring_normalization_and_weights():
    # 1. Exact zero distance, VAN_TRUCK, insulated bags, 50km radius
    # s_dist=1.0 (0.50), s_veh=1.0 (0.25), s_equip=1.0 (0.15), s_rad=1.0 (0.10) => 100.0
    score_max = VolunteerDispatchService.calculate_volunteer_score(
        distance_meters=0.0,
        service_radius_meters=50000.0,
        vehicle_type=VehicleType.VAN_TRUCK,
        has_insulated_bags=True,
        service_radius_km=50.0,
    )
    assert score_max == 100.0

    # 2. FOOT_BIKE, no insulated bags, half radius (2.5km out of 5km)
    # s_dist = 1 - 2500/5000 = 0.5 (0.25)
    # s_veh = 0.5 (0.125)
    # s_equip = 0.5 (0.075)
    # s_radius = 5.0 / 50.0 = 0.1 (0.01)
    # Total = 0.25 + 0.125 + 0.075 + 0.01 = 0.46 * 100 = 46.0
    score_bike = VolunteerDispatchService.calculate_volunteer_score(
        distance_meters=2500.0,
        service_radius_meters=5000.0,
        vehicle_type=VehicleType.FOOT_BIKE,
        has_insulated_bags=False,
        service_radius_km=5.0,
    )
    assert score_bike == 46.0

    # 3. CAR with insulated bags at distance = service_radius
    # s_dist = 0.0 (0.00)
    # s_veh = 0.8 (0.20)
    # s_equip = 1.0 (0.15)
    # s_radius = 20.0 / 50.0 = 0.4 (0.04)
    # Total = 0.0 + 0.20 + 0.15 + 0.04 = 0.39 * 100 = 39.0
    score_car = VolunteerDispatchService.calculate_volunteer_score(
        distance_meters=20000.0,
        service_radius_meters=20000.0,
        vehicle_type=VehicleType.CAR,
        has_insulated_bags=True,
        service_radius_km=20.0,
    )
    assert score_car == 39.0


def test_volunteer_scoring_determinism():
    # Scoring must be strictly deterministic across repeated invocations
    runs = [
        VolunteerDispatchService.calculate_volunteer_score(
            distance_meters=3450.0,
            service_radius_meters=10000.0,
            vehicle_type=VehicleType.CAR,
            has_insulated_bags=True,
            service_radius_km=10.0,
        )
        for _ in range(20)
    ]
    assert len(set(runs)) == 1


def test_build_volunteer_match_reasons():
    vol = Volunteer(
        id=uuid4(),
        user_id=uuid4(),
        full_name="Alex Courier",
        contact_phone="555-0199",
        vehicle_type=VehicleType.CAR,
        has_insulated_bags=True,
        service_radius_km=15.0,
    )
    donation = Donation(
        id=uuid4(),
        business_id=uuid4(),
        title="Chilled Dairy",
        storage_condition=StorageCondition.REFRIGERATED,
    )
    reasons = VolunteerDispatchService.build_volunteer_match_reasons(
        volunteer=vol,
        distance_km=4.25,
        donation=donation,
    )
    assert "available_courier" in reasons
    assert any("within_service_radius" in r for r in reasons)
    assert any("vehicle_capability: CAR" in r for r in reasons)
    assert "insulated_thermal_equipment_ready" in reasons
    assert "meets_thermal_requirement: REFRIGERATED" in reasons


# ==========================================
# 2. Volunteer Discovery Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_find_eligible_volunteers_success_and_ranking():
    user_id = uuid4()
    org_id = uuid4()
    donation_id = uuid4()
    pickup_id = uuid4()

    org_user = User(id=user_id, email="org@foodbank.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=user_id, org_name="Regional Food Bank")

    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        volunteer_id=None,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
    )
    donation = Donation(
        id=donation_id,
        business_id=uuid4(),
        title="Prepared Sandwiches",
        total_weight_kg=12.0,
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        location=WKTElement("POINT(-122.4194 37.7749)", srid=4326),
    )

    vol1 = Volunteer(
        id=uuid4(),
        user_id=uuid4(),
        full_name="Fast Van Driver",
        vehicle_type=VehicleType.VAN_TRUCK,
        has_insulated_bags=True,
        service_radius_km=25.0,
        is_available=True,
    )
    vol2 = Volunteer(
        id=uuid4(),
        user_id=uuid4(),
        full_name="Local Bike Courier",
        vehicle_type=VehicleType.FOOT_BIKE,
        has_insulated_bags=False,
        service_radius_km=5.0,
        is_available=True,
    )

    db_mock = AsyncMock()
    exec_mock_pickup = MagicMock()
    exec_mock_pickup.scalar_one_or_none.return_value = pickup

    exec_mock_org = MagicMock()
    exec_mock_org.scalar_one_or_none.return_value = org

    exec_mock_don = MagicMock()
    exec_mock_don.scalar_one_or_none.return_value = donation

    exec_mock_vols = MagicMock()
    exec_mock_vols.all.return_value = [
        (vol1, 2000.0),  # 2km
        (vol2, 1000.0),  # 1km
    ]

    db_mock.execute.side_effect = [
        exec_mock_pickup,
        exec_mock_org,
        exec_mock_don,
        exec_mock_vols,
    ]

    result = await VolunteerDispatchService.find_eligible_volunteers_for_pickup(
        db=db_mock,
        user=org_user,
        pickup_id=pickup_id,
    )

    assert result.pickup_id == pickup_id
    assert result.total_candidates_found == 2
    assert result.matches[0].volunteer_id == vol1.id
    assert result.matches[0].rank == 1
    assert result.matches[1].volunteer_id == vol2.id
    assert result.matches[1].rank == 2


@pytest.mark.asyncio
async def test_find_volunteers_rejects_org_direct_transport_mode():
    pickup_id = uuid4()
    org_user = User(id=uuid4(), email="org@foodbank.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=uuid4(), user_id=org_user.id, org_name="Food Bank")

    pickup = Pickup(
        id=pickup_id,
        donation_id=uuid4(),
        organization_id=org.id,
        volunteer_id=None,
        transport_mode=TransportMode.ORG_DIRECT,
        status=PickupStatus.ASSIGNED,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.side_effect = [pickup, org]
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc_info:
        await VolunteerDispatchService.find_eligible_volunteers_for_pickup(
            db=db_mock,
            user=org_user,
            pickup_id=pickup_id,
        )
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "ORG_DIRECT" in exc_info.value.detail


# ==========================================
# 3. Volunteer Assignment Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_assign_volunteer_success_and_audit():
    admin_user = User(id=uuid4(), email="admin@matcher.org", role=UserRole.ADMIN, is_active=True)
    vol_id = uuid4()
    pickup_id = uuid4()

    donation_id = uuid4()
    org_id = uuid4()
    business_id = uuid4()
    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        volunteer_id=None,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
    )
    volunteer = Volunteer(
        id=vol_id,
        user_id=uuid4(),
        full_name="Sam Courier",
        is_available=True,
    )
    donation = Donation(id=donation_id, business_id=business_id, title="Surplus Sandwiches", status=DonationStatus.MATCHED)
    org = Organization(id=org_id, user_id=uuid4(), org_name="City Shelter")
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Deli")

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock_pickup = MagicMock()
    exec_mock_pickup.scalar_one_or_none.return_value = pickup

    exec_mock_vol = MagicMock()
    exec_mock_vol.scalar_one_or_none.return_value = volunteer

    exec_mock_don = MagicMock()
    exec_mock_don.scalar_one_or_none.return_value = donation

    exec_mock_org = MagicMock()
    exec_mock_org.scalar_one_or_none.return_value = org

    exec_mock_biz = MagicMock()
    exec_mock_biz.scalar_one_or_none.return_value = business

    db_mock.execute.side_effect = [exec_mock_pickup, exec_mock_vol, exec_mock_don, exec_mock_org, exec_mock_biz]

    res = await VolunteerDispatchService.assign_volunteer_to_pickup(
        db=db_mock,
        user=admin_user,
        pickup_id=pickup_id,
        volunteer_id=vol_id,
        ip_address="127.0.0.1",
    )

    assert res.volunteer_id == vol_id
    assert volunteer.is_available is False

    audit_actions = [obj.action for obj in added_objects if isinstance(obj, AuditLog)]
    assert "PICKUP_VOLUNTEER_ASSIGNED" in audit_actions
    assert "VOLUNTEER_AVAILABILITY_CHANGED" in audit_actions


@pytest.mark.asyncio
async def test_volunteer_self_claim_pickup_success():
    vol_user_id = uuid4()
    vol_id = uuid4()
    pickup_id = uuid4()
    donation_id = uuid4()
    org_id = uuid4()
    business_id = uuid4()

    vol_user = User(id=vol_user_id, email="vol@courier.org", role=UserRole.VOLUNTEER, is_active=True)
    volunteer = Volunteer(
        id=vol_id,
        user_id=vol_user_id,
        full_name="Self Claiming Courier",
        is_available=True,
    )
    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        volunteer_id=None,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
    )
    donation = Donation(id=donation_id, business_id=business_id, title="Apples", status=DonationStatus.MATCHED)
    org = Organization(id=org_id, user_id=uuid4(), org_name="City Shelter")
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Farm")

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock_vol_profile = MagicMock()
    exec_mock_vol_profile.scalar_one_or_none.return_value = volunteer

    exec_mock_pickup = MagicMock()
    exec_mock_pickup.scalar_one_or_none.return_value = pickup

    exec_mock_vol_lock = MagicMock()
    exec_mock_vol_lock.scalar_one_or_none.return_value = volunteer

    exec_mock_don = MagicMock()
    exec_mock_don.scalar_one_or_none.return_value = donation

    exec_mock_org = MagicMock()
    exec_mock_org.scalar_one_or_none.return_value = org

    exec_mock_biz = MagicMock()
    exec_mock_biz.scalar_one_or_none.return_value = business

    db_mock.execute.side_effect = [
        exec_mock_vol_profile,
        exec_mock_pickup,
        exec_mock_vol_lock,
        exec_mock_don,
        exec_mock_org,
        exec_mock_biz,
    ]

    res = await VolunteerDispatchService.assign_volunteer_to_pickup(
        db=db_mock,
        user=vol_user,
        pickup_id=pickup_id,
        volunteer_id=None,  # Self-assign
    )

    assert res.volunteer_id == vol_id
    assert volunteer.is_available is False


@pytest.mark.asyncio
async def test_assign_volunteer_rejects_already_assigned_pickup():
    admin_user = User(id=uuid4(), email="admin@matcher.org", role=UserRole.ADMIN, is_active=True)
    existing_vol_id = uuid4()
    new_vol_id = uuid4()
    pickup_id = uuid4()

    pickup = Pickup(
        id=pickup_id,
        donation_id=uuid4(),
        organization_id=uuid4(),
        volunteer_id=existing_vol_id,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
    )

    db_mock = AsyncMock()
    exec_mock_pickup = MagicMock()
    exec_mock_pickup.scalar_one_or_none.return_value = pickup
    db_mock.execute.return_value = exec_mock_pickup

    with pytest.raises(HTTPException) as exc_info:
        await VolunteerDispatchService.assign_volunteer_to_pickup(
            db=db_mock,
            user=admin_user,
            pickup_id=pickup_id,
            volunteer_id=new_vol_id,
        )
    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert "already assigned" in exc_info.value.detail


@pytest.mark.asyncio
async def test_assign_volunteer_rejects_unavailable_volunteer():
    admin_user = User(id=uuid4(), email="admin@matcher.org", role=UserRole.ADMIN, is_active=True)
    vol_id = uuid4()
    pickup_id = uuid4()

    pickup = Pickup(
        id=pickup_id,
        donation_id=uuid4(),
        organization_id=uuid4(),
        volunteer_id=None,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
    )
    busy_volunteer = Volunteer(
        id=vol_id,
        user_id=uuid4(),
        full_name="Busy Courier",
        is_available=False,
    )

    db_mock = AsyncMock()
    exec_mock_pickup = MagicMock()
    exec_mock_pickup.scalar_one_or_none.return_value = pickup

    exec_mock_vol = MagicMock()
    exec_mock_vol.scalar_one_or_none.return_value = busy_volunteer

    db_mock.execute.side_effect = [exec_mock_pickup, exec_mock_vol]

    with pytest.raises(HTTPException) as exc_info:
        await VolunteerDispatchService.assign_volunteer_to_pickup(
            db=db_mock,
            user=admin_user,
            pickup_id=pickup_id,
            volunteer_id=vol_id,
        )
    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert "unavailable" in exc_info.value.detail


# ==========================================
# 4. Volunteer Release Unit Tests
# ==========================================

@pytest.mark.asyncio
async def test_release_volunteer_success_and_restores_availability():
    vol_user_id = uuid4()
    vol_id = uuid4()
    pickup_id = uuid4()

    vol_user = User(id=vol_user_id, email="vol@courier.org", role=UserRole.VOLUNTEER, is_active=True)
    volunteer = Volunteer(
        id=vol_id,
        user_id=vol_user_id,
        full_name="Releasing Courier",
        is_available=False,
    )
    donation_id = uuid4()
    org_id = uuid4()
    pickup = Pickup(
        id=pickup_id,
        donation_id=donation_id,
        organization_id=org_id,
        volunteer_id=vol_id,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
    )
    donation = Donation(id=donation_id, business_id=uuid4(), title="Apples", status=DonationStatus.MATCHED)
    org = Organization(id=org_id, user_id=uuid4(), org_name="City Shelter")

    added_objects = []
    db_mock = AsyncMock()
    db_mock.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

    exec_mock_pickup = MagicMock()
    exec_mock_pickup.scalar_one_or_none.return_value = pickup

    exec_mock_vol_profile = MagicMock()
    exec_mock_vol_profile.scalar_one_or_none.return_value = volunteer

    exec_mock_vol_lock = MagicMock()
    exec_mock_vol_lock.scalar_one_or_none.return_value = volunteer

    exec_mock_don = MagicMock()
    exec_mock_don.scalar_one_or_none.return_value = donation

    exec_mock_org = MagicMock()
    exec_mock_org.scalar_one_or_none.return_value = org

    db_mock.execute.side_effect = [
        exec_mock_pickup,
        exec_mock_vol_profile,
        exec_mock_vol_lock,
        exec_mock_don,
        exec_mock_org,
    ]

    res = await VolunteerDispatchService.release_volunteer_from_pickup(
        db=db_mock,
        user=vol_user,
        pickup_id=pickup_id,
    )

    assert res.volunteer_id is None
    assert volunteer.is_available is True

    audit_actions = [obj.action for obj in added_objects if isinstance(obj, AuditLog)]
    assert "PICKUP_VOLUNTEER_RELEASED" in audit_actions
    assert "VOLUNTEER_AVAILABILITY_CHANGED" in audit_actions


@pytest.mark.asyncio
async def test_release_volunteer_rejects_pickup_in_transit():
    admin_user = User(id=uuid4(), email="admin@matcher.org", role=UserRole.ADMIN, is_active=True)
    vol_id = uuid4()
    pickup_id = uuid4()

    pickup = Pickup(
        id=pickup_id,
        donation_id=uuid4(),
        organization_id=uuid4(),
        volunteer_id=vol_id,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.IN_TRANSIT,
    )

    db_mock = AsyncMock()
    exec_mock = MagicMock()
    exec_mock.scalar_one_or_none.return_value = pickup
    db_mock.execute.return_value = exec_mock

    with pytest.raises(HTTPException) as exc_info:
        await VolunteerDispatchService.release_volunteer_from_pickup(
            db=db_mock,
            user=admin_user,
            pickup_id=pickup_id,
        )
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "IN_TRANSIT" in exc_info.value.detail


# ==========================================
# 5. Full API Endpoints Integration Tests
# ==========================================

@pytest.mark.asyncio
async def test_api_volunteer_dispatch_endpoints():
    org_user_id = uuid4()
    org_id = uuid4()
    pickup_id = uuid4()
    vol_id = uuid4()
    business_id = uuid4()

    org_user = User(id=org_user_id, email="org@shelter.org", role=UserRole.ORGANIZATION, is_active=True)
    org = Organization(id=org_id, user_id=org_user_id, org_name="Community Shelter")
    business = FoodBusiness(id=business_id, user_id=uuid4(), business_name="Donor Bakery")

    pickup = Pickup(
        id=pickup_id,
        donation_id=uuid4(),
        organization_id=org_id,
        volunteer_id=None,
        transport_mode=TransportMode.VOLUNTEER,
        status=PickupStatus.ASSIGNED,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    donation = Donation(
        id=pickup.donation_id,
        business_id=business_id,
        title="Apples",
        total_weight_kg=10.0,
        storage_condition=StorageCondition.ROOM_TEMPERATURE,
        location=WKTElement("POINT(-122.4194 37.7749)", srid=4326),
    )
    vol = Volunteer(
        id=vol_id,
        user_id=uuid4(),
        full_name="Jane Volunteer",
        vehicle_type=VehicleType.CAR,
        has_insulated_bags=True,
        service_radius_km=15.0,
        is_available=True,
    )

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: org_user
    app.dependency_overrides[get_async_db] = lambda: db_mock

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. GET /api/v1/pickups/{pickup_id}/volunteers
        exec_mock_pickup = MagicMock()
        exec_mock_pickup.scalar_one_or_none.return_value = pickup

        exec_mock_org = MagicMock()
        exec_mock_org.scalar_one_or_none.return_value = org

        exec_mock_don = MagicMock()
        exec_mock_don.scalar_one_or_none.return_value = donation

        exec_mock_vols = MagicMock()
        exec_mock_vols.all.return_value = [(vol, 3000.0)]

        db_mock.execute.side_effect = [
            exec_mock_pickup,
            exec_mock_org,
            exec_mock_don,
            exec_mock_vols,
        ]

        resp = await client.get(f"/api/v1/pickups/{pickup_id}/volunteers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_candidates_found"] == 1
        assert data["matches"][0]["volunteer_id"] == str(vol_id)
        assert data["matches"][0]["rank"] == 1

        # 2. POST /api/v1/pickups/{pickup_id}/assign
        exec_assign_pickup = MagicMock()
        exec_assign_pickup.scalar_one_or_none.return_value = pickup

        exec_assign_org = MagicMock()
        exec_assign_org.scalar_one_or_none.return_value = org

        exec_assign_vol = MagicMock()
        exec_assign_vol.scalar_one_or_none.return_value = vol

        exec_assign_don = MagicMock()
        exec_assign_don.scalar_one_or_none.return_value = donation

        exec_assign_org_notify = MagicMock()
        exec_assign_org_notify.scalar_one_or_none.return_value = org

        exec_assign_biz = MagicMock()
        exec_assign_biz.scalar_one_or_none.return_value = business

        db_mock.execute.side_effect = [
            exec_assign_pickup,
            exec_assign_org,
            exec_assign_vol,
            exec_assign_don,
            exec_assign_org_notify,
            exec_assign_biz,
        ]

        resp_assign = await client.post(
            f"/api/v1/pickups/{pickup_id}/assign",
            json={"volunteer_id": str(vol_id)},
        )
        assert resp_assign.status_code == 200
        assert resp_assign.json()["volunteer_id"] == str(vol_id)

        # 3. POST /api/v1/pickups/{pickup_id}/release
        pickup.volunteer_id = vol_id
        exec_rel_pickup = MagicMock()
        exec_rel_pickup.scalar_one_or_none.return_value = pickup

        exec_rel_org = MagicMock()
        exec_rel_org.scalar_one_or_none.return_value = org

        exec_rel_vol = MagicMock()
        exec_rel_vol.scalar_one_or_none.return_value = vol

        exec_rel_don = MagicMock()
        exec_rel_don.scalar_one_or_none.return_value = donation

        exec_rel_org_notify = MagicMock()
        exec_rel_org_notify.scalar_one_or_none.return_value = org

        exec_rel_vol_notify = MagicMock()
        exec_rel_vol_notify.scalar_one_or_none.return_value = vol

        db_mock.execute.side_effect = [
            exec_rel_pickup,
            exec_rel_org,
            exec_rel_vol,
            exec_rel_don,
            exec_rel_org_notify,
            exec_rel_vol_notify,
        ]

        resp_release = await client.post(f"/api/v1/pickups/{pickup_id}/release")
        assert resp_release.status_code == 200
        assert resp_release.json()["volunteer_id"] is None

    app.dependency_overrides.clear()
