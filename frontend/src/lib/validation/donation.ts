import { z } from "zod";

export const donationSchema = z
  .object({
    title: z
      .string()
      .min(2, "Title must be at least 2 characters")
      .max(255, "Title cannot exceed 255 characters"),
    food_category: z.enum(
      [
        "PREPARED_MEALS",
        "BAKERY",
        "PRODUCE",
        "DAIRY",
        "MEAT",
        "PACKAGED",
        "OTHER",
      ],
      { message: "Please select a food category" }
    ),
    quantity_value: z
      .number({ message: "Quantity count must be a number" })
      .gt(0, "Quantity must be greater than 0"),
    quantity_unit: z.enum(["KG", "PORTIONS", "TRAYS", "BOXES", "ITEMS"], {
      message: "Please select a unit of measurement",
    }),
    total_weight_kg: z
      .number({ message: "Total weight must be a number" })
      .gt(0, "Total weight must be greater than 0 kg"),
    storage_condition: z.enum(
      ["ROOM_TEMPERATURE", "REFRIGERATED", "FROZEN", "HOT_HOLDING"],
      { message: "Please select a storage temperature condition" }
    ),
    packaging_type: z
      .string()
      .min(1, "Packaging type description is required")
      .max(100, "Packaging type cannot exceed 100 characters"),
    preparation_time: z.string().optional().nullable(),
    available_from: z.string().optional().nullable(),
    pickup_deadline: z.string().min(1, "Pickup deadline is required"),
    safe_consumption_deadline: z
      .string()
      .min(1, "Safe consumption deadline is required"),
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
    pickup_notes: z
      .string()
      .max(1000, "Pickup notes cannot exceed 1000 characters")
      .optional()
      .nullable(),
    image_url: z
      .string()
      .max(1000, "Image URL cannot exceed 1000 characters")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      if (!data.available_from || !data.pickup_deadline) return true;
      const avail = new Date(data.available_from).getTime();
      const pickup = new Date(data.pickup_deadline).getTime();
      return pickup > avail;
    },
    {
      message: "Pickup deadline must be strictly after the available from time",
      path: ["pickup_deadline"],
    }
  )
  .refine(
    (data) => {
      if (!data.pickup_deadline || !data.safe_consumption_deadline) return true;
      const pickup = new Date(data.pickup_deadline).getTime();
      const safe = new Date(data.safe_consumption_deadline).getTime();
      return safe >= pickup;
    },
    {
      message: "Safe consumption deadline cannot be earlier than the pickup deadline",
      path: ["safe_consumption_deadline"],
    }
  )
  .refine(
    (data) => {
      if (!data.preparation_time || !data.safe_consumption_deadline) return true;
      const prep = new Date(data.preparation_time).getTime();
      const safe = new Date(data.safe_consumption_deadline).getTime();
      return safe > prep;
    },
    {
      message: "Safe consumption deadline must be strictly after preparation time",
      path: ["safe_consumption_deadline"],
    }
  );

export type DonationFormData = z.infer<typeof donationSchema>;
