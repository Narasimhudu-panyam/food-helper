import { z } from "zod";

export const pickupClaimSchema = z.object({
  pickup_id: z
    .string()
    .uuid("Please enter a valid 36-character UUID for the pickup task"),
});

export type PickupClaimFormData = z.infer<typeof pickupClaimSchema>;

export const pickupFailSchema = z.object({
  failure_reason: z
    .string()
    .min(3, "Failure reason must be at least 3 characters")
    .max(1000, "Failure reason cannot exceed 1000 characters"),
});

export type PickupFailFormData = z.infer<typeof pickupFailSchema>;

export const pickupCreateSchema = z.object({
  scheduled_pickup_time: z.string().optional().nullable(),
  transport_mode: z.enum(["ORG_DIRECT", "VOLUNTEER"]),
  notes: z
    .string()
    .max(1000, "Notes cannot exceed 1000 characters")
    .optional()
    .nullable(),
});

export type PickupCreateFormData = z.infer<typeof pickupCreateSchema>;

export const pickupCancelSchema = z.object({
  cancellation_reason: z
    .string()
    .min(3, "Cancellation reason must be at least 3 characters")
    .max(1000, "Cancellation reason cannot exceed 1000 characters"),
});

export type PickupCancelFormData = z.infer<typeof pickupCancelSchema>;

export const pickupCompleteSchema = z.object({
  dropoff_confirmation_pin: z
    .string()
    .max(6, "PIN code cannot exceed 6 characters")
    .optional()
    .nullable(),
  notes: z
    .string()
    .max(1000, "Notes cannot exceed 1000 characters")
    .optional()
    .nullable(),
});

export type PickupCompleteFormData = z.infer<typeof pickupCompleteSchema>;
