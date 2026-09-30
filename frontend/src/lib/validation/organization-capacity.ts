import { z } from "zod";

export const organizationCapacitySchema = z
  .object({
    max_capacity_kg: z
      .number({ message: "Max capacity must be a valid number" })
      .min(0, "Max storage capacity cannot be negative"),
    current_capacity_kg: z
      .number({ message: "Current capacity must be a valid number" })
      .min(0, "Current occupied storage cannot be negative"),
  })
  .refine(
    (data) => data.current_capacity_kg <= data.max_capacity_kg,
    {
      message: "Current occupied capacity cannot exceed maximum storage capacity",
      path: ["current_capacity_kg"],
    }
  );

export type OrganizationCapacityFormData = z.infer<
  typeof organizationCapacitySchema
>;
