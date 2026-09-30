import pytest
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateTable
from geoalchemy2 import Geography

from app.core.database import Base
from app.models import (
    User,
    FoodBusiness,
    Organization,
    Volunteer,
    Donation,
    DonationMatch,
    Pickup,
    Notification,
    AuditLog,
    UserRole,
    BusinessType,
    OrgType,
    OrgVerificationStatus,
    VehicleType,
    FoodCategory,
    QuantityUnit,
    StorageCondition,
    DonationStatus,
    MatchStatus,
    TransportMode,
    PickupStatus,
    NotificationType,
)


def test_models_metadata_registration():
    """Verify all 9 core entities are registered in Base metadata."""
    tables = Base.metadata.tables
    expected_tables = {
        "users",
        "food_businesses",
        "organizations",
        "volunteers",
        "donations",
        "donation_matches",
        "pickups",
        "notifications",
        "audit_logs",
    }
    assert expected_tables.issubset(set(tables.keys()))


def test_user_model_structure():
    """Verify User model columns, indices, and constraints."""
    table = User.__table__
    assert "email" in table.c
    assert "password_hash" in table.c
    assert "role" in table.c
    assert "is_active" in table.c
    assert "is_verified" in table.c
    assert table.c.email.unique or any(idx.unique and "email" in [col.name for col in idx.columns] for idx in table.indexes)


def test_food_business_spatial_location():
    """Verify FoodBusiness has spatial geography location column."""
    table = FoodBusiness.__table__
    assert "location" in table.c
    assert isinstance(table.c.location.type, Geography)
    assert table.c.location.type.srid == 4326
    assert table.c.location.type.geometry_type == "POINT"


def test_organization_capacity_and_constraints():
    """Verify Organization capacity fields and check constraints."""
    table = Organization.__table__
    assert "max_capacity_kg" in table.c
    assert "current_capacity_kg" in table.c
    assert "verification_status" in table.c
    assert "accepted_categories" in table.c
    assert "can_pickup" in table.c

    constraint_names = {ck.name for ck in table.constraints if hasattr(ck, "name")}
    assert "ck_org_max_capacity_positive" in constraint_names
    assert "ck_org_current_capacity_valid" in constraint_names


def test_volunteer_structure():
    """Verify Volunteer model vehicle and coverage radius."""
    table = Volunteer.__table__
    assert "vehicle_type" in table.c
    assert "service_radius_km" in table.c
    assert "is_available" in table.c
    assert "has_insulated_bags" in table.c
    assert isinstance(table.c.home_location.type, Geography)

    constraint_names = {ck.name for ck in table.constraints if hasattr(ck, "name")}
    assert "ck_volunteer_radius_positive" in constraint_names


def test_donation_time_and_safety_constraints():
    """Verify Donation model time windows and check constraints."""
    table = Donation.__table__
    assert "quantity_value" in table.c
    assert "total_weight_kg" in table.c
    assert "pickup_deadline" in table.c
    assert "safe_consumption_deadline" in table.c
    assert "available_from" in table.c
    assert "status" in table.c
    assert "food_category" in table.c
    assert "storage_condition" in table.c
    assert isinstance(table.c.location.type, Geography)

    constraint_names = {ck.name for ck in table.constraints if hasattr(ck, "name")}
    assert "ck_donation_qty_positive" in constraint_names
    assert "ck_donation_weight_positive" in constraint_names
    assert "ck_donation_pickup_window" in constraint_names
    assert "ck_donation_consumption_window" in constraint_names


def test_donation_match_unique_and_checks():
    """Verify DonationMatch unique constraint and scoring checks."""
    table = DonationMatch.__table__
    assert "donation_id" in table.c
    assert "organization_id" in table.c
    assert "score" in table.c
    assert "rank_order" in table.c
    assert "status" in table.c

    constraint_names = {c.name for c in table.constraints if hasattr(c, "name")}
    assert "uq_donation_org_match" in constraint_names
    assert "ck_match_rank_positive" in constraint_names
    assert "ck_match_score_range" in constraint_names
    assert "ck_match_distance_non_negative" in constraint_names


def test_pickup_relationship_and_checks():
    """Verify Pickup 1:1 donation constraint and timing validation."""
    table = Pickup.__table__
    assert "donation_id" in table.c
    assert "organization_id" in table.c
    assert "volunteer_id" in table.c
    assert "transport_mode" in table.c
    assert "status" in table.c
    assert "dropoff_confirmation_pin" in table.c

    constraint_names = {c.name for c in table.constraints if hasattr(c, "name")}
    assert "ck_pickup_delivery_time_valid" in constraint_names


def test_notifications_and_audit_logs():
    """Verify Notification and AuditLog schema definition."""
    notif_table = Notification.__table__
    audit_table = AuditLog.__table__

    assert "recipient_id" in notif_table.c
    assert "notification_type" in notif_table.c
    assert "is_read" in notif_table.c

    assert "actor_id" in audit_table.c
    assert "action" in audit_table.c
    assert "entity_type" in audit_table.c
    assert "entity_id" in audit_table.c
    assert "previous_state" in audit_table.c
    assert "new_state" in audit_table.c


def test_ddl_compilation_for_postgresql():
    """Verify PostgreSQL DDL compiles cleanly for all tables."""
    engine = create_engine("postgresql+psycopg2://postgres:postgres@localhost/test_db")
    for table_name, table in Base.metadata.tables.items():
        create_stmt = str(CreateTable(table).compile(engine))
        assert table_name in create_stmt
        assert "CREATE TABLE" in create_stmt
