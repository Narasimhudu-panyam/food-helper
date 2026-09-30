import { Notification, UserRole } from "@/types";

export function getNotificationDeepLink(
  notification: Notification,
  role?: UserRole
): string | null {
  if (!notification.related_entity_id) {
    return null;
  }

  const { related_entity_type, related_entity_id, notification_type } = notification;

  // Match Notifications
  if (
    related_entity_type === "match" ||
    notification_type === "MATCH_INVITATION" ||
    notification_type === "MATCH_ACCEPTED" ||
    notification_type === "MATCH_DECLINED"
  ) {
    if (role === "ORGANIZATION") {
      return `/app/organization/matches/${related_entity_id}`;
    }
    if (role === "FOOD_BUSINESS") {
      return `/app/business/donations`;
    }
    return "/app/notifications";
  }

  // Pickup Notifications
  if (
    related_entity_type === "pickup" ||
    notification_type === "PICKUP_ASSIGNED" ||
    notification_type === "PICKUP_STATUS_UPDATE" ||
    notification_type === "DONATION_CANCELLED"
  ) {
    if (role === "VOLUNTEER") {
      return `/app/volunteer/pickups/${related_entity_id}`;
    }
    if (role === "ORGANIZATION") {
      return `/app/organization/pickups/${related_entity_id}`;
    }
    if (role === "FOOD_BUSINESS") {
      return `/app/business/pickups/${related_entity_id}`;
    }
    return "/app/notifications";
  }

  // Donation Notifications
  if (
    related_entity_type === "donation" ||
    notification_type === "DONATION_DELIVERED"
  ) {
    if (role === "FOOD_BUSINESS") {
      return `/app/business/donations/${related_entity_id}`;
    }
    if (role === "ORGANIZATION") {
      return `/app/organization/pickups`;
    }
    if (role === "VOLUNTEER") {
      return `/app/volunteer/pickups`;
    }
    return "/app/notifications";
  }

  // Organization Verification Changed
  if (
    related_entity_type === "organization" ||
    notification_type === "VERIFICATION_STATUS_CHANGED"
  ) {
    if (role === "ORGANIZATION") {
      return `/app/organization/profile`;
    }
    return "/app/notifications";
  }

  return null;
}
