import { z } from "zod";

export const VEHICLE_TYPE_OPTIONS = [
  { value: "CAR", label: "Automobile (Car / Sedan / SUV)" },
  { value: "VAN_TRUCK", label: "Cargo Van / Pickup Truck" },
  { value: "FOOT_BIKE", label: "Bicycle / Scooter / Foot" },
  { value: "OTHER", label: "Other Vehicle Type" },
];

export const volunteerProfileSchema = z.object({
  full_name: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(255, "Full name cannot exceed 255 characters"),
  contact_phone: z
    .string()
    .min(5, "Contact phone number must be at least 5 characters")
    .max(50, "Contact phone number cannot exceed 50 characters"),
  vehicle_type: z.enum(["FOOT_BIKE", "CAR", "VAN_TRUCK", "OTHER"], {
    message: "Please select a vehicle type",
  }),
  has_insulated_bags: z.boolean(),
  service_radius_km: z
    .number({ message: "Service radius must be a valid number" })
    .gt(0, "Service radius must be greater than 0 km")
    .lte(100, "Service radius cannot exceed 100 km"),
  home_location: z
    .object({
      latitude: z
        .number({ message: "Latitude must be a valid number" })
        .min(-90, "Latitude must be between -90 and 90")
        .max(90, "Latitude must be between -90 and 90"),
      longitude: z
        .number({ message: "Longitude must be a valid number" })
        .min(-180, "Longitude must be between -180 and 180")
        .max(180, "Longitude must be between -180 and 180"),
    })
    .optional()
    .nullable(),
});

export type VolunteerProfileFormData = z.infer<typeof volunteerProfileSchema>;
