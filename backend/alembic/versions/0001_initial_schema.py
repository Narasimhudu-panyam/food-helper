"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-05 12:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable PostGIS extension and UUID generation
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis;')
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.Enum('FOOD_BUSINESS', 'ORGANIZATION', 'VOLUNTEER', 'ADMIN', name='user_role', native_enum=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('is_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_role', 'users', ['role'], unique=False)

    # 2. food_businesses table
    op.create_table(
        'food_businesses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('business_name', sa.String(length=255), nullable=False),
        sa.Column('business_type', sa.Enum('RESTAURANT', 'SUPERMARKET', 'BAKERY', 'HOTEL', 'CATERER', 'OTHER', name='business_type', native_enum=True), nullable=False),
        sa.Column('address_text', sa.String(length=500), nullable=False),
        sa.Column('location', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
        sa.Column('contact_phone', sa.String(length=50), nullable=False),
        sa.Column('pickup_instructions', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', name='uq_food_business_user_id'),
    )
    op.create_index('ix_food_businesses_user_id', 'food_businesses', ['user_id'], unique=True)
    op.create_index('idx_food_businesses_location', 'food_businesses', ['location'], unique=False, postgresql_using='gist')

    # 3. organizations table
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org_name', sa.String(length=255), nullable=False),
        sa.Column('org_type', sa.Enum('SHELTER', 'FOOD_BANK', 'SOUP_KITCHEN', 'COMMUNITY_PANTRY', 'OTHER', name='org_type', native_enum=True), nullable=False),
        sa.Column('tax_id', sa.String(length=100), nullable=True),
        sa.Column('address_text', sa.String(length=500), nullable=False),
        sa.Column('location', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
        sa.Column('contact_phone', sa.String(length=50), nullable=False),
        sa.Column('verification_status', sa.Enum('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', name='org_verification_status', native_enum=True), server_default='PENDING', nullable=False),
        sa.Column('max_capacity_kg', sa.Numeric(precision=10, scale=2), server_default='0.0', nullable=False),
        sa.Column('current_capacity_kg', sa.Numeric(precision=10, scale=2), server_default='0.0', nullable=False),
        sa.Column('accepted_categories', postgresql.ARRAY(sa.String(length=50)), server_default='{}', nullable=False),
        sa.Column('can_pickup', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('operating_hours', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('max_capacity_kg >= 0', name='ck_org_max_capacity_positive'),
        sa.CheckConstraint('current_capacity_kg >= 0 AND current_capacity_kg <= max_capacity_kg', name='ck_org_current_capacity_valid'),
        sa.UniqueConstraint('user_id', name='uq_organization_user_id'),
    )
    op.create_index('ix_organizations_user_id', 'organizations', ['user_id'], unique=True)
    op.create_index('ix_organizations_verification_status', 'organizations', ['verification_status'], unique=False)
    op.create_index('idx_organizations_location', 'organizations', ['location'], unique=False, postgresql_using='gist')

    # 4. volunteers table
    op.create_table(
        'volunteers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('contact_phone', sa.String(length=50), nullable=False),
        sa.Column('vehicle_type', sa.Enum('FOOT_BIKE', 'CAR', 'VAN_TRUCK', 'OTHER', name='vehicle_type', native_enum=True), nullable=False),
        sa.Column('has_insulated_bags', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('home_location', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326, from_text='ST_GeogFromText', name='geography', nullable=True), nullable=True),
        sa.Column('service_radius_km', sa.Numeric(precision=5, scale=2), server_default='10.0', nullable=False),
        sa.Column('is_available', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('service_radius_km > 0', name='ck_volunteer_radius_positive'),
        sa.UniqueConstraint('user_id', name='uq_volunteer_user_id'),
    )
    op.create_index('ix_volunteers_user_id', 'volunteers', ['user_id'], unique=True)
    op.create_index('ix_volunteers_is_available', 'volunteers', ['is_available'], unique=False)
    op.create_index('idx_volunteers_home_location', 'volunteers', ['home_location'], unique=False, postgresql_using='gist')

    # 5. donations table
    op.create_table(
        'donations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('business_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('food_businesses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('food_category', sa.Enum('PREPARED_MEALS', 'BAKERY', 'PRODUCE', 'DAIRY', 'MEAT', 'PACKAGED', 'OTHER', name='food_category', native_enum=True), nullable=False),
        sa.Column('quantity_value', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('quantity_unit', sa.Enum('KG', 'PORTIONS', 'TRAYS', 'BOXES', 'ITEMS', name='quantity_unit', native_enum=True), nullable=False),
        sa.Column('total_weight_kg', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('storage_condition', sa.Enum('ROOM_TEMPERATURE', 'REFRIGERATED', 'FROZEN', 'HOT_HOLDING', name='storage_condition', native_enum=True), nullable=False),
        sa.Column('packaging_type', sa.String(length=100), nullable=False),
        sa.Column('preparation_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('available_from', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('pickup_deadline', sa.DateTime(timezone=True), nullable=False),
        sa.Column('safe_consumption_deadline', sa.DateTime(timezone=True), nullable=False),
        sa.Column('location', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
        sa.Column('pickup_notes', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(length=1000), nullable=True),
        sa.Column('status', sa.Enum('DRAFT', 'CREATED', 'MATCHED', 'ACCEPTED', 'PICKUP_ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'FAILED_DELIVERY', name='donation_status', native_enum=True), server_default='CREATED', nullable=False),
        sa.Column('handoff_pin', sa.String(length=6), nullable=True),
        sa.Column('cancellation_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('quantity_value > 0', name='ck_donation_qty_positive'),
        sa.CheckConstraint('total_weight_kg > 0', name='ck_donation_weight_positive'),
        sa.CheckConstraint('pickup_deadline > available_from', name='ck_donation_pickup_window'),
        sa.CheckConstraint('safe_consumption_deadline >= pickup_deadline', name='ck_donation_consumption_window'),
    )
    op.create_index('ix_donations_business_id', 'donations', ['business_id'], unique=False)
    op.create_index('ix_donations_status', 'donations', ['status'], unique=False)
    op.create_index('ix_donations_food_category', 'donations', ['food_category'], unique=False)
    op.create_index('ix_donations_pickup_deadline', 'donations', ['pickup_deadline'], unique=False)
    op.create_index('ix_donations_safe_consumption_deadline', 'donations', ['safe_consumption_deadline'], unique=False)
    op.create_index('idx_donations_location', 'donations', ['location'], unique=False, postgresql_using='gist')

    # 6. donation_matches table
    op.create_table(
        'donation_matches',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('donation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('donations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('distance_meters', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('score', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('rank_order', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('PROPOSED', 'INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED', name='match_status', native_enum=True), server_default='PROPOSED', nullable=False),
        sa.Column('rejection_reason', sa.String(length=255), nullable=True),
        sa.Column('invited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('donation_id', 'organization_id', name='uq_donation_org_match'),
        sa.CheckConstraint('rank_order >= 1', name='ck_match_rank_positive'),
        sa.CheckConstraint('score >= 0.0 AND score <= 100.0', name='ck_match_score_range'),
        sa.CheckConstraint('distance_meters >= 0.0', name='ck_match_distance_non_negative'),
    )
    op.create_index('ix_donation_matches_donation_id', 'donation_matches', ['donation_id'], unique=False)
    op.create_index('ix_donation_matches_organization_id', 'donation_matches', ['organization_id'], unique=False)
    op.create_index('ix_donation_matches_status', 'donation_matches', ['status'], unique=False)

    # 7. pickups table
    op.create_table(
        'pickups',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('donation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('donations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('volunteer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('volunteers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('transport_mode', sa.Enum('ORG_DIRECT', 'VOLUNTEER', name='transport_mode', native_enum=True), nullable=False),
        sa.Column('status', sa.Enum('ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED', name='pickup_status', native_enum=True), server_default='ASSIGNED', nullable=False),
        sa.Column('scheduled_pickup_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('picked_up_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dropoff_confirmation_pin', sa.String(length=6), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('donation_id', name='uq_pickups_donation_id'),
        sa.CheckConstraint('delivered_at IS NULL OR picked_up_at IS NULL OR delivered_at >= picked_up_at', name='ck_pickup_delivery_time_valid'),
    )
    op.create_index('ix_pickups_donation_id', 'pickups', ['donation_id'], unique=True)
    op.create_index('ix_pickups_organization_id', 'pickups', ['organization_id'], unique=False)
    op.create_index('ix_pickups_volunteer_id', 'pickups', ['volunteer_id'], unique=False)
    op.create_index('ix_pickups_status', 'pickups', ['status'], unique=False)

    # 8. notifications table
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('recipient_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('notification_type', sa.Enum('MATCH_INVITATION', 'MATCH_ACCEPTED', 'MATCH_DECLINED', 'PICKUP_ASSIGNED', 'PICKUP_STATUS_UPDATE', 'DONATION_DELIVERED', 'DONATION_CANCELLED', 'VERIFICATION_STATUS_CHANGED', 'SYSTEM_ALERT', name='notification_type', native_enum=True), nullable=False),
        sa.Column('related_entity_type', sa.String(length=50), nullable=True),
        sa.Column('related_entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_notifications_recipient_id', 'notifications', ['recipient_id'], unique=False)
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'], unique=False)
    op.create_index('ix_notifications_notification_type', 'notifications', ['notification_type'], unique=False)

    # 9. audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('previous_state', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('new_state', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_audit_logs_actor_id', 'audit_logs', ['actor_id'], unique=False)
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'], unique=False)
    op.create_index('ix_audit_logs_entity_type', 'audit_logs', ['entity_type'], unique=False)
    op.create_index('ix_audit_logs_entity_id', 'audit_logs', ['entity_id'], unique=False)
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('notifications')
    op.drop_table('pickups')
    op.drop_table('donation_matches')
    op.drop_table('donations')
    op.drop_table('volunteers')
    op.drop_table('organizations')
    op.drop_table('food_businesses')
    op.drop_table('users')

    # Drop ENUM types
    sa.Enum(name='notification_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='pickup_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='transport_mode').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='match_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='donation_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='storage_condition').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='quantity_unit').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='food_category').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vehicle_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='org_verification_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='org_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='business_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='user_role').drop(op.get_bind(), checkfirst=True)
