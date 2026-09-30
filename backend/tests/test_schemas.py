from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
import pytest
from pydantic import ValidationError

from app.models.enums import (
    BusinessType,
    DonationStatus,
    FoodCategory,
    MatchStatus,
    NotificationType,
    OrgType,
    OrgVerificationStatus,
    PickupStatus,
    QuantityUnit,
    StorageCondition,
    TransportMode,
    UserRole,
    VehicleType,
)
from app.schemas import (
    LocationCoordinates,
    UserRegisterRequest,
    UserLoginRequest,
    UserUpdateRequest,
    UserResponse,
    FoodBusinessCreate,
    FoodBusinessUpdate,
    FoodBusinessResponse,
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationAdminVerificationUpdate,
    OrganizationResponse,
    VolunteerCreate,
    VolunteerUpdate,
    VolunteerResponse,
    DonationCreate,
    DonationUpdate,
    DonationCancelRequest,
    DonationResponse,
    MatchAcceptRequest,
    MatchDeclineRequest,
    MatchResponse,
    PickupAssignVolunteerRequest,
    PickupStatusUpdateRequest,
    PickupVerifyHandoffRequest,
    PickupResponse,
    NotificationResponse,
    AuditLogResponse,
)


def test_location_coordinates_validation():
    """Verify valid and invalid geographic coordinates."""
    # Valid
    loc = LocationCoordinates(latitude=17.385044, longitude=78.486671)
    assert loc.latitude == 17.385044
    assert loc.longitude == 78.486671

    # Invalid latitude > 90
    with pytest.raises(ValidationError):
        LocationCoordinates(latitude=95.0, longitude=78.0)

    # Invalid latitude < -90
    with pytest.raises(ValidationError):
        LocationCoordinates(latitude=-91.0, longitude=78.0)

    # Invalid longitude > 180
    with pytest.raises(ValidationError):
        LocationCoordinates(latitude=17.0, longitude=185.0)

    # Invalid longitude < -180
    with pytest.raises(ValidationError):
        LocationCoordinates(latitude=17.0, longitude=-185.0)


def test_user_registration_and_response_security():
    """Verify user registration rules and password hash exclusion."""
    # Valid registration
    reg = UserRegisterRequest(
        email="donor@kitchen.com",
        password="SecurePassword123!",
        role=UserRole.FOOD_BUSINESS,
    )
    assert reg.email == "donor@kitchen.com"
    assert reg.role == UserRole.FOOD_BUSINESS

    # Prevent Admin self-registration
    with pytest.raises(ValidationError) as exc:
        UserRegisterRequest(
            email="admin@system.com",
            password="SecurePassword123!",
            role=UserRole.ADMIN,
        )
    assert "Direct self-registration as ADMIN is not permitted" in str(exc.value)

    # Short password rejection
    with pytest.raises(ValidationError):
        UserRegisterRequest(
            email="donor@kitchen.com",
            password="short",
            role=UserRole.FOOD_BUSINESS,
        )

    # UserResponse does NOT expose password
    now = datetime.now(timezone.utc)
    user_resp = UserResponse(
        id=uuid.uuid4(),
        email="donor@kitchen.com",
        role=UserRole.FOOD_BUSINESS,
        is_active=True,
        is_verified=False,
        created_at=now,
        updated_at=now,
    )
    assert not hasattr(user_resp, "password")
    assert not hasattr(user_resp, "password_hash")


def test_food_business_schemas():
    """Verify FoodBusiness creation, update, and response."""
    fb_data = {
        "business_name": "Sunrise Bakery",
        "business_type": BusinessType.BAKERY,
        "address_text": "123 Main Street, Suite 4",
        "location": {"latitude": 17.4482, "longitude": 78.3915},
        "contact_phone": "+1-555-0199",
        "pickup_instructions": "Loading dock in rear alley",
    }
    fb_create = FoodBusinessCreate(**fb_data)
    assert fb_create.business_name == "Sunrise Bakery"
    assert fb_create.location.latitude == 17.4482

    # Partial update
    fb_update = FoodBusinessUpdate(business_name="Sunrise Artisan Bakery")
    assert fb_update.business_name == "Sunrise Artisan Bakery"
    assert fb_update.contact_phone is None


def test_organization_schemas_and_protected_fields():
    """Verify Organization schemas and admin verification separation."""
    org_data = {
        "org_name": "Hope Shelter",
        "org_type": OrgType.SHELTER,
        "tax_id": "501C3-998822",
        "address_text": "456 Relief Blvd",
        "location": {"latitude": 17.4200, "longitude": 78.4500},
        "contact_phone": "+1-555-0288",
        "max_capacity_kg": Decimal("250.0"),
        "accepted_categories": ["BAKERY", "PREPARED_MEALS"],
        "can_pickup": True,
    }
    org_create = OrganizationCreate(**org_data)
    assert org_create.max_capacity_kg == Decimal("250.0")

    # Negative capacity rejected
    with pytest.raises(ValidationError):
        OrganizationCreate(**{**org_data, "max_capacity_kg": Decimal("-10.0")})

    # Normal organization update does NOT include verification status
    org_update = OrganizationUpdate(org_name="Hope Community Shelter")
    assert not hasattr(org_update, "verification_status")

    # Admin verification update
    admin_action = OrganizationAdminVerificationUpdate(verification_status=OrgVerificationStatus.VERIFIED)
    assert admin_action.verification_status == OrgVerificationStatus.VERIFIED


def test_volunteer_schemas():
    """Verify Volunteer creation and service radius."""
    vol_data = {
        "full_name": "Alex Courier",
        "contact_phone": "+1-555-0377",
        "vehicle_type": VehicleType.CAR,
        "has_insulated_bags": True,
        "service_radius_km": Decimal("15.0"),
        "home_location": {"latitude": 17.4100, "longitude": 78.4300},
    }
    vol_create = VolunteerCreate(**vol_data)
    assert vol_create.service_radius_km == Decimal("15.0")
    assert vol_create.has_insulated_bags is True

    # Negative/Zero service radius rejected
    with pytest.raises(ValidationError):
        VolunteerCreate(**{**vol_data, "service_radius_km": Decimal("0.0")})


def test_donation_valid_and_timeline_validation():
    """Verify DonationCreate timeline integrity and safety deadlines."""
    now = datetime.now(timezone.utc)
    prep_time = now - timedelta(hours=2)
    avail_from = now
    pickup_dl = now + timedelta(hours=3)
    safe_dl = now + timedelta(hours=6)

    valid_donation = {
        "title": "Fresh Cooked Rice & Curry Trays",
        "food_category": FoodCategory.PREPARED_MEALS,
        "quantity_value": Decimal("10.0"),
        "quantity_unit": QuantityUnit.TRAYS,
        "total_weight_kg": Decimal("25.0"),
        "storage_condition": StorageCondition.HOT_HOLDING,
        "packaging_type": "Insulated Metal Trays",
        "preparation_time": prep_time,
        "available_from": avail_from,
        "pickup_deadline": pickup_dl,
        "safe_consumption_deadline": safe_dl,
        "location": {"latitude": 17.3850, "longitude": 78.4867},
        "pickup_notes": "Pick up before kitchen closing at 10 PM",
    }
    d_create = DonationCreate(**valid_donation)
    assert d_create.title == "Fresh Cooked Rice & Curry Trays"
    assert d_create.quantity_value == Decimal("10.0")

    # 1. Zero/Negative quantity rejected
    with pytest.raises(ValidationError):
        DonationCreate(**{**valid_donation, "quantity_value": Decimal("0.0")})

    # 2. Zero/Negative weight rejected
    with pytest.raises(ValidationError):
        DonationCreate(**{**valid_donation, "total_weight_kg": Decimal("-5.0")})

    # 3. Pickup deadline before available_from rejected
    with pytest.raises(ValidationError) as exc:
        DonationCreate(
            **{
                **valid_donation,
                "pickup_deadline": avail_from - timedelta(hours=1),
            }
        )
    assert "pickup_deadline must be strictly after available_from" in str(exc.value)

    # 4. Safe consumption deadline before pickup deadline rejected
    with pytest.raises(ValidationError) as exc:
        DonationCreate(
            **{
                **valid_donation,
                "safe_consumption_deadline": pickup_dl - timedelta(hours=1),
            }
        )
    assert "safe_consumption_deadline cannot be earlier than pickup_deadline" in str(exc.value)


def test_match_schemas():
    """Verify Match response and accept/decline schemas."""
    # Match accept
    accept_req = MatchAcceptRequest(transport_mode=TransportMode.ORG_DIRECT)
    assert accept_req.transport_mode == TransportMode.ORG_DIRECT

    # Match decline
    decline_req = MatchDeclineRequest(rejection_reason="No cold storage capacity available tonight")
    assert "No cold storage" in decline_req.rejection_reason

    # Too short decline reason rejected
    with pytest.raises(ValidationError):
        MatchDeclineRequest(rejection_reason="x")


def test_pickup_verification_pin_validation():
    """Verify Pickup handoff PIN validation."""
    # Valid 6-digit PIN
    pin_req = PickupVerifyHandoffRequest(handoff_pin="583920")
    assert pin_req.handoff_pin == "583920"

    # Invalid PIN length (5 digits)
    with pytest.raises(ValidationError):
        PickupVerifyHandoffRequest(handoff_pin="12345")

    # Invalid PIN length (7 digits)
    with pytest.raises(ValidationError):
        PickupVerifyHandoffRequest(handoff_pin="1234567")

    # Status update
    status_req = PickupStatusUpdateRequest(
        status=PickupStatus.IN_TRANSIT,
        notes="Picked up food safely, en route to shelter",
    )
    assert status_req.status == PickupStatus.IN_TRANSIT
