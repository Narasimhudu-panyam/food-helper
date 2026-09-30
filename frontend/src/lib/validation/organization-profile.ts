import { z } from "zod";

export const FOOD_CATEGORY_OPTIONS = [
  { value: "PREPARED_MEALS", label: "Prepared Meals" },
  { value: "BAKERY", label: "Bakery & Breads" },
  { value: "PRODUCE", label: "Fresh Produce" },
  { value: "DAIRY", label: "Dairy & Eggs" },
  { value: "MEAT", label: "Meat & Poultry" },
  { value: "PACKAGED", label: "Packaged & Canned Goods" },
  { value: "OTHER", label: "Other Food Items" },
];

export const ORG_TYPE_OPTIONS = [
  { value: "FOOD_BANK", label: "Food Bank / Central Distribution" },
  { value: "SHELTER", label: "Emergency Shelter / Temporary Housing" },
  { value: "SOUP_KITCHEN", label: "Soup Kitchen / Meal Program" },
  { value: "COMMUNITY_PANTRY", label: "Community Pantry" },
  { value: "OTHER", label: "Other Relief Organization" },
];

export const organizationProfileSchema = z.object({
  org_name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(255, "Organization name cannot exceed 255 characters"),
  org_type: z.enum(
    ["SHELTER", "FOOD_BANK", "SOUP_KITCHEN", "COMMUNITY_PANTRY", "OTHER"],
    { message: "Please select an organization type" }
  ),
  tax_id: z
    .string()
    .max(100, "Tax ID cannot exceed 100 characters")
    .optional()
    .nullable(),
  address_text: z
    .string()
    .min(5, "Physical address must be at least 5 characters")
    .max(500, "Physical address cannot exceed 500 characters"),
  contact_phone: z
    .string()
    .min(5, "Contact phone number must be at least 5 characters")
    .max(50, "Contact phone number cannot exceed 50 characters"),
  max_capacity_kg: z
    .number({ message: "Max capacity must be a valid number" })
    .min(0, "Max storage capacity cannot be negative"),
  accepted_categories: z
    .array(z.string())
    .min(1, "Please select at least one accepted food category"),
  can_pickup: z.boolean(),
  location: z.object({
    latitude: z
      .number({ message: "Latitude is required" })
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90"),
    longitude: z
      .number({ message: "Longitude is required" })
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180"),
  }),
});

export type OrganizationProfileFormData = z.infer<
  typeof organizationProfileSchema
>;
