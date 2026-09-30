import { z } from "zod";

export const businessProfileSchema = z.object({
  business_name: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(255, "Business name cannot exceed 255 characters"),
  business_type: z.enum(
    ["RESTAURANT", "SUPERMARKET", "BAKERY", "HOTEL", "CATERER", "OTHER"],
    { message: "Please select a valid business type" }
  ),
  address_text: z
    .string()
    .min(5, "Physical address must be at least 5 characters")
    .max(500, "Physical address cannot exceed 500 characters"),
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
  contact_phone: z
    .string()
    .min(5, "Contact phone must be at least 5 characters")
    .max(50, "Contact phone cannot exceed 50 characters"),
  pickup_instructions: z
    .string()
    .max(1000, "Pickup instructions cannot exceed 1000 characters")
    .optional()
    .nullable(),
});

export type BusinessProfileFormData = z.infer<typeof businessProfileSchema>;
