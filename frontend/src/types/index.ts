/**
 * Comprehensive domain type definitions matching the backend FastAPI & PostgreSQL contracts.
 */

// ==========================================
// 1. Enums
// ==========================================

export type UserRole = "FOOD_BUSINESS" | "ORGANIZATION" | "VOLUNTEER" | "ADMIN";

export type BusinessType =
  | "RESTAURANT"
  | "SUPERMARKET"
  | "BAKERY"
  | "HOTEL"
  | "CATERER"
  | "OTHER";

export type OrgType =
  | "SHELTER"
  | "FOOD_BANK"
  | "SOUP_KITCHEN"
  | "COMMUNITY_PANTRY"
  | "OTHER";

export type OrgVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

export type VehicleType = "FOOT_BIKE" | "CAR" | "VAN_TRUCK" | "OTHER";

export type FoodCategory =
  | "PREPARED_MEALS"
  | "BAKERY"
  | "PRODUCE"
  | "DAIRY"
  | "MEAT"
  | "PACKAGED"
  | "OTHER";

export type QuantityUnit = "KG" | "PORTIONS" | "TRAYS" | "BOXES" | "ITEMS";

export type StorageCondition =
  | "ROOM_TEMPERATURE"
  | "REFRIGERATED"
  | "FROZEN"
  | "HOT_HOLDING";

export type DonationStatus =
  | "DRAFT"
  | "CREATED"
  | "MATCHED"
  | "ACCEPTED"
  | "PICKUP_ASSIGNED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED_DELIVERY";

export type MatchStatus =
  | "PROPOSED"
  | "INVITED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "REVOKED";

export type TransportMode = "ORG_DIRECT" | "VOLUNTEER";

export type PickupStatus =
  | "ASSIGNED"
  | "EN_ROUTE_TO_PICKUP"
  | "ARRIVED_AT_PICKUP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

export type NotificationType =
  | "MATCH_INVITATION"
  | "MATCH_ACCEPTED"
  | "MATCH_DECLINED"
  | "PICKUP_ASSIGNED"
  | "PICKUP_STATUS_UPDATE"
  | "DONATION_DELIVERED"
  | "DONATION_CANCELLED"
  | "VERIFICATION_STATUS_CHANGED"
  | "SYSTEM_ALERT";


// ==========================================
// 2. Spatial Types
// ==========================================

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}


// ==========================================
// 3. User & Auth Contracts
// ==========================================

export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in?: number;
  user?: User;
}


// ==========================================
// 4. Domain Profile Entities
// ==========================================

export interface FoodBusiness {
  id: string;
  user_id: string;
  business_name: string;
  business_type: BusinessType;
  address_text: string;
  location: LocationCoordinates;
  contact_phone: string;
  pickup_instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoodBusinessCreate {
  business_name: string;
  business_type: BusinessType;
  address_text: string;
  location: LocationCoordinates;
  contact_phone: string;
  pickup_instructions?: string | null;
}

export interface FoodBusinessUpdate {
  business_name?: string;
  business_type?: BusinessType;
  address_text?: string;
  location?: LocationCoordinates;
  contact_phone?: string;
  pickup_instructions?: string | null;
}

export interface Organization {
  id: string;
  user_id: string;
  org_name: string;
  org_type: OrgType;
  tax_id?: string | null;
  address_text: string;
  location: LocationCoordinates;
  contact_phone: string;
  verification_status: OrgVerificationStatus;
  max_capacity_kg: number;
  current_capacity_kg: number;
  accepted_categories: string[];
  can_pickup: boolean;
  operating_hours?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreate {
  org_name: string;
  org_type: OrgType;
  tax_id?: string | null;
  address_text: string;
  location: LocationCoordinates;
  contact_phone: string;
  max_capacity_kg: number;
  accepted_categories?: string[];
  can_pickup?: boolean;
  operating_hours?: Record<string, any> | null;
}

export interface OrganizationUpdate {
  org_name?: string;
  org_type?: OrgType;
  tax_id?: string | null;
  address_text?: string;
  location?: LocationCoordinates;
  contact_phone?: string;
  max_capacity_kg?: number;
  current_capacity_kg?: number;
  accepted_categories?: string[];
  can_pickup?: boolean;
  operating_hours?: Record<string, any> | null;
}

export interface AdminOrganization extends Organization {
  owner_email?: string | null;
  is_active?: boolean;
}

export interface OrganizationRejectRequest {
  reason: string;
}

export interface AdminOrganizationListParams {
  verification_status?: OrgVerificationStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BusinessProfileSummary {
  id: string;
  business_name: string;
  business_type: BusinessType;
  contact_phone: string;
  address_text: string;
}

export interface OrganizationProfileSummary {
  id: string;
  org_name: string;
  org_type: OrgType;
  contact_phone: string;
  address_text: string;
  verification_status: OrgVerificationStatus;
}

export interface VolunteerProfileSummary {
  id: string;
  full_name: string;
  contact_phone: string;
  vehicle_type: VehicleType;
  is_available: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  display_name?: string | null;
  profile_name?: string | null;
}


export interface AdminUserDetail extends AdminUser {
  business_profile?: BusinessProfileSummary | null;
  organization_profile?: OrganizationProfileSummary | null;
  volunteer_profile?: VolunteerProfileSummary | null;
}

export interface AdminUserListParams {
  role?: UserRole;
  is_active?: boolean;
  is_verified?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}


export interface Volunteer {
  id: string;
  user_id: string;
  full_name: string;
  contact_phone: string;
  vehicle_type: VehicleType;
  has_insulated_bags: boolean;
  home_location?: LocationCoordinates | null;
  service_radius_km: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface VolunteerCreate {
  full_name: string;
  contact_phone: string;
  vehicle_type: VehicleType;
  has_insulated_bags?: boolean;
  service_radius_km?: number;
  home_location?: LocationCoordinates | null;
}

export interface VolunteerUpdate {
  full_name?: string;
  contact_phone?: string;
  vehicle_type?: VehicleType;
  has_insulated_bags?: boolean;
  home_location?: LocationCoordinates | null;
  service_radius_km?: number;
  is_available?: boolean;
}


// ==========================================
// 5. Donation & Food Safety Entities
// ==========================================

export interface Donation {
  id: string;
  business_id: string;
  title: string;
  food_category: FoodCategory;
  quantity_value: number;
  quantity_unit: QuantityUnit;
  total_weight_kg: number;
  storage_condition: StorageCondition;
  packaging_type: string;
  preparation_time?: string | null;
  available_from: string;
  pickup_deadline: string;
  safe_consumption_deadline: string;
  location: LocationCoordinates;
  pickup_notes?: string | null;
  image_url?: string | null;
  status: DonationStatus;
  handoff_pin?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DonationCreate {
  title: string;
  food_category: FoodCategory;
  quantity_value: number;
  quantity_unit: QuantityUnit;
  total_weight_kg: number;
  storage_condition: StorageCondition;
  packaging_type: string;
  preparation_time?: string | null;
  available_from?: string | null;
  pickup_deadline: string;
  safe_consumption_deadline: string;
  location: LocationCoordinates;
  pickup_notes?: string | null;
  image_url?: string | null;
}

export interface DonationUpdate {
  title?: string;
  food_category?: FoodCategory;
  quantity_value?: number;
  quantity_unit?: QuantityUnit;
  total_weight_kg?: number;
  storage_condition?: StorageCondition;
  packaging_type?: string;
  preparation_time?: string | null;
  available_from?: string | null;
  pickup_deadline?: string;
  safe_consumption_deadline?: string;
  location?: LocationCoordinates;
  pickup_notes?: string | null;
  image_url?: string | null;
}

export interface DonationCancelRequest {
  cancellation_reason: string;
}


// ==========================================
// 6. Matching & Pickups
// ==========================================

export interface DonationMatch {
  id: string;
  donation_id: string;
  organization_id: string;
  distance_meters: number;
  score: number;
  rank_order: number;
  status: MatchStatus;
  rejection_reason?: string | null;
  invited_at?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  created_at: string;
}

export interface MatchOfferCreate {
  organization_id: string;
}

export interface MatchAcceptRequest {
  transport_mode: TransportMode;
}

export interface MatchDeclineRequest {
  rejection_reason: string;
}

export interface CandidateMatchResponse {
  organization_id: string;
  org_name: string;
  org_type: string;
  distance_km: number;
  distance_meters: number;
  available_capacity_kg: number;
  max_capacity_kg: number;
  current_capacity_kg: number;
  score: number;
  rank: number;
  match_reasons: string[];
}

export interface DonationMatchListResponse {
  donation_id: string;
  total_candidates_found: number;
  matches: CandidateMatchResponse[];
}

export interface Pickup {
  id: string;
  donation_id: string;
  organization_id: string;
  volunteer_id?: string | null;
  transport_mode: TransportMode;
  status: PickupStatus;
  scheduled_pickup_time?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickupCreateRequest {
  scheduled_pickup_time?: string | null;
  transport_mode?: TransportMode;
  notes?: string | null;
}

export interface PickupCancelRequest {
  cancellation_reason: string;
}

export interface PickupFailRequest {
  failure_reason: string;
}

export interface CandidateVolunteerMatchResponse {
  volunteer_id: string;
  full_name: string;
  vehicle_type: VehicleType;
  has_insulated_bags: boolean;
  distance_km: number;
  distance_meters: number;
  service_radius_km: number;
  score: number;
  rank: number;
  match_reasons: string[];
}

export interface PickupVolunteerMatchListResponse {
  pickup_id: string;
  total_candidates_found: number;
  matches: CandidateVolunteerMatchResponse[];
}

export interface PickupAssignVolunteerRequest {
  volunteer_id?: string | null;
}

export interface PickupVerifyDeliveryRequest {
  dropoff_confirmation_pin?: string | null;
  notes?: string | null;
}



// ==========================================
// 7. Notifications
// ==========================================

export interface Notification {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  total: number;
  unread_count: number;
  items: Notification[];
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface BatchMarkReadResponse {
  updated_count: number;
}

export interface WebSocketNotificationMessage {
  type: string;
  notification: Notification;
}



// ==========================================
// 8. General Response Wrappers
// ==========================================

export interface PaginatedResponse<T> {
  total: number;
  items: T[];
  limit: number;
  offset: number;
}

export interface ApiErrorResponse {
  detail: string | { loc?: (string | number)[]; msg?: string; type?: string }[];
}


// ==========================================
// 9. Analytics & Impact Contracts
// ==========================================

export type TimeRangePreset = "7d" | "30d" | "90d" | "all";

export interface AnalyticsSummary {
  total_donations: number;
  active_donations: number;
  delivered_donations: number;
  cancelled_donations: number;
  total_weight_kg_donated: number;
  total_weight_kg_delivered: number;
  total_pickups: number;
  active_pickups: number;
  delivered_pickups: number;
  failed_pickups: number;
}

export interface MatchingAnalytics {
  total_matches: number;
  accepted_matches: number;
  declined_matches: number;
  acceptance_rate: number;
  avg_distance_km: number;
  avg_match_score: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  total_weight_kg: number;
}

export interface TrendDataPoint {
  date: string;
  donations_count: number;
  delivered_count: number;
  weight_kg_donated: number;
  weight_kg_delivered: number;
}

export interface AnalyticsOverview {
  role: UserRole;
  time_range: string;
  summary: AnalyticsSummary;
  matching: MatchingAnalytics;
  categories: CategoryDistribution[];
  trends: TrendDataPoint[];
  role_metrics: Record<string, any>;
}

