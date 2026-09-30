import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { donationSchema } from "@/lib/validation/donation";
import { organizationCapacitySchema } from "@/lib/validation/organization-capacity";
import { organizationProfileSchema } from "@/lib/validation/organization-profile";
import { businessProfileSchema } from "@/lib/validation/business-profile";
import { volunteerProfileSchema } from "@/lib/validation/volunteer-profile";
import {
  matchAcceptSchema,
  matchDeclineSchema,
} from "@/lib/validation/match-action";
import {
  pickupCreateSchema,
  pickupCancelSchema,
  pickupFailSchema,
  pickupCompleteSchema,
  pickupClaimSchema,
} from "@/lib/validation/pickup-action";

describe("Auth Validation Schemas", () => {
  describe("loginSchema", () => {
    it("accepts valid email and password", () => {
      const valid = { email: "donor@business.local", password: "SecurePassword123!" };
      const result = loginSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid email format", () => {
      const invalid = { email: "not-an-email", password: "password123" };
      const result = loginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("valid email");
      }
    });

    it("rejects empty password", () => {
      const invalid = { email: "donor@business.local", password: "" };
      const result = loginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Password is required");
      }
    });
  });

  describe("registerSchema", () => {
    it("accepts valid registration for permitted roles", () => {
      const roles = ["FOOD_BUSINESS", "ORGANIZATION", "VOLUNTEER"] as const;
      for (const role of roles) {
        const valid = {
          email: `user_${role.toLowerCase()}@example.com`,
          password: "SuperSecretPassword123!",
          confirmPassword: "SuperSecretPassword123!",
          role,
        };
        const result = registerSchema.safeParse(valid);
        expect(result.success).toBe(true);
      }
    });

    it("rejects ADMIN role registration", () => {
      const invalid = {
        email: "admin@example.com",
        password: "SuperSecretPassword123!",
        confirmPassword: "SuperSecretPassword123!",
        role: "ADMIN",
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects password shorter than 8 characters", () => {
      const invalid = {
        email: "user@example.com",
        password: "short",
        confirmPassword: "short",
        role: "VOLUNTEER",
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at least 8 characters");
      }
    });

    it("rejects mismatched password and confirmPassword", () => {
      const invalid = {
        email: "user@example.com",
        password: "Password123!",
        confirmPassword: "DifferentPassword123!",
        role: "VOLUNTEER",
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Passwords do not match");
      }
    });
  });
});

describe("Donation Validation Schema", () => {
  const baseValidDonation = {
    title: "Fresh Artisan Baguettes",
    food_category: "BAKERY",
    quantity_value: 15,
    quantity_unit: "ITEMS",
    total_weight_kg: 7.5,
    storage_condition: "ROOM_TEMPERATURE",
    packaging_type: "Paper bags and insulated food containers",
    preparation_time: "2026-10-01T08:00:00.000Z",
    available_from: "2026-10-01T09:00:00.000Z",
    pickup_deadline: "2026-10-01T14:00:00.000Z",
    safe_consumption_deadline: "2026-10-01T18:00:00.000Z",
    location: {
      latitude: 12.9716,
      longitude: 77.5946,
    },
    pickup_notes: "Pick up at back kitchen door",
    image_url: null,
  };

  it("validates a compliant donation payload", () => {
    const result = donationSchema.safeParse(baseValidDonation);
    expect(result.success).toBe(true);
  });

  it("rejects non-positive quantity and weight", () => {
    const invalid = {
      ...baseValidDonation,
      quantity_value: 0,
      total_weight_kg: -2,
    };
    const result = donationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside global bounds", () => {
    const invalidLat = {
      ...baseValidDonation,
      location: { latitude: 95, longitude: 77.5946 },
    };
    expect(donationSchema.safeParse(invalidLat).success).toBe(false);

    const invalidLng = {
      ...baseValidDonation,
      location: { latitude: 12.9716, longitude: 190 },
    };
    expect(donationSchema.safeParse(invalidLng).success).toBe(false);
  });

  it("enforces pickup_deadline strictly after available_from", () => {
    const invalid = {
      ...baseValidDonation,
      available_from: "2026-10-01T12:00:00.000Z",
      pickup_deadline: "2026-10-01T10:00:00.000Z",
    };
    const result = donationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("pickup_deadline"))).toBe(true);
    }
  });

  it("enforces safe_consumption_deadline >= pickup_deadline", () => {
    const invalid = {
      ...baseValidDonation,
      pickup_deadline: "2026-10-01T15:00:00.000Z",
      safe_consumption_deadline: "2026-10-01T14:00:00.000Z",
    };
    const result = donationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("safe_consumption_deadline"))).toBe(true);
    }
  });

  it("enforces safe_consumption_deadline > preparation_time", () => {
    const invalid = {
      ...baseValidDonation,
      preparation_time: "2026-10-01T18:00:00.000Z",
      safe_consumption_deadline: "2026-10-01T17:00:00.000Z",
    };
    const result = donationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("Organization Capacity Schema", () => {
  it("validates valid organization capacity payload", () => {
    const valid = {
      max_capacity_kg: 500,
      current_capacity_kg: 100,
    };
    const result = organizationCapacitySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects current capacity exceeding max capacity", () => {
    const invalid = {
      max_capacity_kg: 200,
      current_capacity_kg: 350,
    };
    const result = organizationCapacitySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative capacity numbers", () => {
    const invalid = {
      max_capacity_kg: -50,
      current_capacity_kg: 0,
    };
    const result = organizationCapacitySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("Profile Schemas", () => {
  it("validates businessProfileSchema", () => {
    const valid = {
      business_name: "Sunrise Bakery & Cafe",
      business_type: "BAKERY",
      address_text: "123 Main Street, Suite 400",
      contact_phone: "+1234567890",
      location: {
        latitude: 12.9716,
        longitude: 77.5946,
      },
      pickup_instructions: "Use loading bay 2",
    };
    const result = businessProfileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates organizationProfileSchema", () => {
    const valid = {
      org_name: "City Food Bank",
      org_type: "FOOD_BANK",
      tax_id: "TAX-12345",
      address_text: "456 Relief Avenue",
      contact_phone: "+1987654321",
      max_capacity_kg: 1000,
      accepted_categories: ["PREPARED_MEALS", "BAKERY"],
      can_pickup: true,
      location: {
        latitude: 12.9716,
        longitude: 77.5946,
      },
    };
    const result = organizationProfileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates volunteerProfileSchema", () => {
    const valid = {
      full_name: "Alex Johnson",
      contact_phone: "+1122334455",
      vehicle_type: "CAR",
      has_insulated_bags: true,
      service_radius_km: 10,
      home_location: {
        latitude: 12.9716,
        longitude: 77.5946,
      },
    };
    const result = volunteerProfileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("Match and Pickup Action Schemas", () => {
  it("validates matchAcceptSchema and matchDeclineSchema", () => {
    expect(matchAcceptSchema.safeParse({ transport_mode: "VOLUNTEER" }).success).toBe(true);
    expect(matchAcceptSchema.safeParse({ transport_mode: "ORG_DIRECT" }).success).toBe(true);
    expect(matchAcceptSchema.safeParse({ transport_mode: "INVALID_MODE" }).success).toBe(false);

    expect(
      matchDeclineSchema.safeParse({ rejection_reason: "Storage is currently full" }).success
    ).toBe(true);
    expect(matchDeclineSchema.safeParse({ rejection_reason: "x" }).success).toBe(false);
  });

  it("validates pickup schemas", () => {
    expect(
      pickupCreateSchema.safeParse({
        transport_mode: "VOLUNTEER",
        notes: "Fragile pastry boxes",
      }).success
    ).toBe(true);

    expect(
      pickupClaimSchema.safeParse({
        pickup_id: "c2c544d6-f844-4866-9b63-1d0726715b74",
      }).success
    ).toBe(true);

    expect(
      pickupClaimSchema.safeParse({
        pickup_id: "not-a-uuid",
      }).success
    ).toBe(false);

    expect(
      pickupFailSchema.safeParse({
        failure_reason: "Severe traffic disruption prevented arrival",
      }).success
    ).toBe(true);

    expect(
      pickupCancelSchema.safeParse({
        cancellation_reason: "Donor withdrew available items",
      }).success
    ).toBe(true);

    expect(
      pickupCompleteSchema.safeParse({
        dropoff_confirmation_pin: "123456",
        notes: "Handed over directly to kitchen manager",
      }).success
    ).toBe(true);
  });
});
