"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus, X } from "lucide-react";

import { AuthGuard } from "@/lib/auth/auth-guard";
import { useBusinessProfile } from "@/hooks/use-business-profile";
import { useCreateDonation } from "@/hooks/use-donations";
import { DonationFormData, donationSchema } from "@/lib/validation/donation";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { FoodCategory, QuantityUnit, StorageCondition } from "@/types";
import { CoordinateInput } from "@/components/maps/coordinate-input";

const CATEGORY_OPTIONS: Array<{ value: FoodCategory; label: string }> = [
  { value: "PREPARED_MEALS", label: "Prepared Meals / Hot Food" },
  { value: "BAKERY", label: "Bakery / Bread / Pastries" },
  { value: "PRODUCE", label: "Fresh Produce / Fruits & Vegetables" },
  { value: "DAIRY", label: "Dairy / Milk / Cheese / Eggs" },
  { value: "MEAT", label: "Fresh or Frozen Meat / Poultry" },
  { value: "PACKAGED", label: "Packaged / Dry Pantry Goods" },
  { value: "OTHER", label: "Other Food Items" },
];

const UNIT_OPTIONS: Array<{ value: QuantityUnit; label: string }> = [
  { value: "KG", label: "Kilograms (KG)" },
  { value: "PORTIONS", label: "Individual Portions" },
  { value: "TRAYS", label: "Catering Trays" },
  { value: "BOXES", label: "Boxes / Crates" },
  { value: "ITEMS", label: "Individual Items" },
];

const STORAGE_OPTIONS: Array<{ value: StorageCondition; label: string }> = [
  { value: "ROOM_TEMPERATURE", label: "Room Temperature / Shelf-Stable" },
  { value: "REFRIGERATED", label: "Refrigerated (35°F – 41°F / 2°C – 5°C)" },
  { value: "FROZEN", label: "Frozen (0°F / -18°C or below)" },
  { value: "HOT_HOLDING", label: "Hot Holding (135°F / 57°C or above)" },
];

export default function CreateDonationPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const { data: profile } = useBusinessProfile();
  const createMutation = useCreateDonation();

  const [serverError, setServerError] = useState<string | null>(null);

  // Default dates: available now, pickup deadline in 4 hours, safe deadline in 24 hours
  const now = new Date();
  const defaultPickup = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const defaultSafe = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const formatIsoForInput = (d: Date) => d.toISOString().slice(0, 16);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DonationFormData>({
    resolver: zodResolver(donationSchema),
    defaultValues: {
      title: "",
      food_category: "PREPARED_MEALS",
      quantity_value: 10,
      quantity_unit: "PORTIONS",
      total_weight_kg: 5,
      storage_condition: "REFRIGERATED",
      packaging_type: "Sealed Aluminum Trays",
      preparation_time: formatIsoForInput(now),
      available_from: formatIsoForInput(now),
      pickup_deadline: formatIsoForInput(defaultPickup),
      safe_consumption_deadline: formatIsoForInput(defaultSafe),
      location: {
        latitude: profile?.location.latitude || 37.7749,
        longitude: profile?.location.longitude || -122.4194,
      },
      pickup_notes: "",
    },
  });

  // Prefill location when business profile loads
  useEffect(() => {
    if (profile?.location) {
      setValue("location.latitude", profile.location.latitude);
      setValue("location.longitude", profile.location.longitude);
    }
  }, [profile, setValue]);

  const onSubmit = async (data: DonationFormData) => {
    setServerError(null);
    try {
      const created = await createMutation.mutateAsync({
        title: data.title,
        food_category: data.food_category as FoodCategory,
        quantity_value: Number(data.quantity_value),
        quantity_unit: data.quantity_unit as QuantityUnit,
        total_weight_kg: Number(data.total_weight_kg),
        storage_condition: data.storage_condition as StorageCondition,
        packaging_type: data.packaging_type,
        preparation_time: data.preparation_time
          ? new Date(data.preparation_time).toISOString()
          : null,
        available_from: data.available_from
          ? new Date(data.available_from).toISOString()
          : null,
        pickup_deadline: new Date(data.pickup_deadline).toISOString(),
        safe_consumption_deadline: new Date(data.safe_consumption_deadline).toISOString(),
        location: {
          latitude: Number(data.location.latitude),
          longitude: Number(data.location.longitude),
        },
        pickup_notes: data.pickup_notes || null,
        image_url: data.image_url || null,
      });

      success("Your donation has been listed and is ready for matching.", "Donation Created");
      router.push(`/app/business/donations/${created.id}`);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Failed to list donation. Please verify time windows and numeric quantities.";
      setServerError(msg);
      toastError(msg, "Submission Error");
    }
  };

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href="/app/business/donations"
            className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Donations
          </Link>
        </div>

        <PageHeader
          title="Create Food Donation"
          description="List surplus food with temperature and safety deadlines for automated non-profit matching."
        />

        <Card>
          <CardHeader>
            <CardTitle>Donation Information</CardTitle>
            <CardDescription>
              All listed items are matched against local non-profit storage capacity and food categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {serverError && (
                <Alert
                  variant="error"
                  title="Could Not Create Donation"
                  onDismiss={() => setServerError(null)}
                >
                  {serverError}
                </Alert>
              )}

              {/* Title & Category */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Donation Title"
                  placeholder="e.g. 5 Trays of Vegetable Lasagna"
                  error={errors.title?.message}
                  disabled={isSubmitting}
                  {...register("title")}
                />

                <Select
                  label="Food Category"
                  options={CATEGORY_OPTIONS}
                  error={errors.food_category?.message}
                  disabled={isSubmitting}
                  {...register("food_category")}
                />
              </div>

              {/* Quantity, Unit & Weight */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Quantity Value"
                  type="number"
                  step="any"
                  placeholder="e.g. 10"
                  error={errors.quantity_value?.message}
                  disabled={isSubmitting}
                  {...register("quantity_value", { valueAsNumber: true })}
                />

                <Select
                  label="Measurement Unit"
                  options={UNIT_OPTIONS}
                  error={errors.quantity_unit?.message}
                  disabled={isSubmitting}
                  {...register("quantity_unit")}
                />

                <Input
                  label="Total Weight (KG)"
                  type="number"
                  step="any"
                  placeholder="e.g. 15.5"
                  helperText="Required for vehicle capacity routing"
                  error={errors.total_weight_kg?.message}
                  disabled={isSubmitting}
                  {...register("total_weight_kg", { valueAsNumber: true })}
                />
              </div>

              {/* Storage Regime & Packaging */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Storage Condition"
                  options={STORAGE_OPTIONS}
                  error={errors.storage_condition?.message}
                  disabled={isSubmitting}
                  {...register("storage_condition")}
                />

                <Input
                  label="Packaging Type"
                  placeholder="e.g. Sealed Foil Catering Trays, Cardboard Boxes"
                  error={errors.packaging_type?.message}
                  disabled={isSubmitting}
                  {...register("packaging_type")}
                />
              </div>

              {/* Temporal Safety Windows */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    Time Windows & Safety Deadlines
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Ensures perishable donations are collected before expiration.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Preparation / Cooking Time (Optional)"
                    type="datetime-local"
                    helperText="When cooked or prepared"
                    error={errors.preparation_time?.message}
                    disabled={isSubmitting}
                    {...register("preparation_time")}
                  />

                  <Input
                    label="Available From (Optional)"
                    type="datetime-local"
                    helperText="Earliest time drivers can collect"
                    error={errors.available_from?.message}
                    disabled={isSubmitting}
                    {...register("available_from")}
                  />

                  <Input
                    label="Pickup Deadline *"
                    type="datetime-local"
                    helperText="Latest pickup time before closing"
                    error={errors.pickup_deadline?.message}
                    disabled={isSubmitting}
                    {...register("pickup_deadline")}
                  />

                  <Input
                    label="Safe Consumption Deadline *"
                    type="datetime-local"
                    helperText="Must be at or after pickup deadline"
                    error={errors.safe_consumption_deadline?.message}
                    disabled={isSubmitting}
                    {...register("safe_consumption_deadline")}
                  />
                </div>
              </div>

              {/* Location Coordinates & Map Picker */}
              <div className="space-y-2">
                {profile && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setValue("location.latitude", profile.location.latitude, { shouldValidate: true });
                        setValue("location.longitude", profile.location.longitude, { shouldValidate: true });
                      }}
                      className="text-xs h-7 px-2"
                    >
                      Use Business Profile Coordinates ({profile.location.latitude.toFixed(2)}, {profile.location.longitude.toFixed(2)})
                    </Button>
                  </div>
                )}
                <CoordinateInput
                  latitude={watch("location.latitude")}
                  longitude={watch("location.longitude")}
                  onChange={(coords) => {
                    setValue("location.latitude", coords.latitude, { shouldValidate: true });
                    setValue("location.longitude", coords.longitude, { shouldValidate: true });
                  }}
                  latError={errors.location?.latitude?.message}
                  lngError={errors.location?.longitude?.message}
                  disabled={isSubmitting}
                  label="Pickup Location Coordinates"
                  helperText="Exact coordinates where transport courier will collect this donation"
                />
              </div>

              {/* Notes */}
              <Textarea
                label="Specific Pickup Instructions / Driver Notes (Optional)"
                placeholder="e.g. Loading bay #2; check in with Sous Chef upon arrival."
                error={errors.pickup_notes?.message}
                disabled={isSubmitting}
                rows={3}
                {...register("pickup_notes")}
              />

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-100">
                <Link href="/app/business/donations">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    disabled={isSubmitting}
                    leftIcon={<X className="h-4 w-4 mr-1" />}
                  >
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  leftIcon={<Plus className="h-4 w-4 mr-1" />}
                >
                  Create Donation
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageContainer>
    </AuthGuard>
  );
}
