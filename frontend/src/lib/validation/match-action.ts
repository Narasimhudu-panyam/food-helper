import { z } from "zod";

export const matchAcceptSchema = z.object({
  transport_mode: z.enum(["ORG_DIRECT", "VOLUNTEER"], {
    message: "Please select a transport mode for pickup",
  }),
});

export type MatchAcceptFormData = z.infer<typeof matchAcceptSchema>;

export const matchDeclineSchema = z.object({
  rejection_reason: z
    .string()
    .min(2, "Please provide a reason with at least 2 characters")
    .max(255, "Reason cannot exceed 255 characters"),
});

export type MatchDeclineFormData = z.infer<typeof matchDeclineSchema>;
