import { describe, it, expect } from "vitest";
import { getNotificationDeepLink } from "@/lib/notifications/notification-routing";
import { Notification } from "@/types";

describe("Notification Routing", () => {
  const baseNotification: Notification = {
    id: "notif-123",
    recipient_id: "user-456",
    notification_type: "MATCH_INVITATION",
    title: "New Match Available",
    message: "A new donation match has been generated.",
    is_read: false,
    created_at: "2026-10-01T10:00:00.000Z",
    related_entity_type: "match",
    related_entity_id: "match-999",
  };

  it("returns match detail route for ORGANIZATION role", () => {
    const route = getNotificationDeepLink(baseNotification, "ORGANIZATION");
    expect(route).toBe("/app/organization/matches/match-999");
  });

  it("returns donations overview route for FOOD_BUSINESS role on match notification", () => {
    const route = getNotificationDeepLink(baseNotification, "FOOD_BUSINESS");
    expect(route).toBe("/app/business/donations");
  });

  it("returns pickup detail route for VOLUNTEER role", () => {
    const pickupNotif: Notification = {
      ...baseNotification,
      notification_type: "PICKUP_ASSIGNED",
      related_entity_type: "pickup",
      related_entity_id: "pickup-777",
    };
    const route = getNotificationDeepLink(pickupNotif, "VOLUNTEER");
    expect(route).toBe("/app/volunteer/pickups/pickup-777");
  });

  it("returns pickup detail route for ORGANIZATION role", () => {
    const pickupNotif: Notification = {
      ...baseNotification,
      notification_type: "PICKUP_STATUS_UPDATE",
      related_entity_type: "pickup",
      related_entity_id: "pickup-777",
    };
    const route = getNotificationDeepLink(pickupNotif, "ORGANIZATION");
    expect(route).toBe("/app/organization/pickups/pickup-777");
  });

  it("returns donation detail route for FOOD_BUSINESS role on donation delivery", () => {
    const donationNotif: Notification = {
      ...baseNotification,
      notification_type: "DONATION_DELIVERED",
      related_entity_type: "donation",
      related_entity_id: "don-111",
    };
    const route = getNotificationDeepLink(donationNotif, "FOOD_BUSINESS");
    expect(route).toBe("/app/business/donations/don-111");
  });

  it("returns null when related_entity_id is missing", () => {
    const noEntityNotif: Notification = {
      ...baseNotification,
      related_entity_id: undefined,
    };
    const route = getNotificationDeepLink(noEntityNotif, "FOOD_BUSINESS");
    expect(route).toBeNull();
  });
});
