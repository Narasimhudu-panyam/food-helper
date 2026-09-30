"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Save, X } from "lucide-react";

import { AuthGuard } from "@/lib/auth/auth-guard";
import { useDonation, useUpdateDonation } from "@/hooks/use-donations";
import { DonationFormData, donationSchema } from "@/lib/validation/donation";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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

const TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "EXPIRED", "FAILED_DELIVERY"];

export default function EditDonationPage({
  params,
}: {
  params: Promise<{ donationId: string }>;
}) {
  const resolvedParams = use(params);
  const donationId = resolvedParams.donationId;

  const router = useRouter();
  const { success, error: toastError } = useToast();

  const { data: donation, isLoading, isError } = useDonation(donationId);
  const updateMutation = useUpdateDonation(donationId);

  const [serverError, setServerError] = useState<string | null>(null);

  const formatIsoForInput = (iso?: string | null) => {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 16);
  };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DonationFormData>({
    resolver: zodResolver(donationSchema),
  });

  useEffect(() => {
    if (donation) {
      reset({
        title: donation.title,
        food_category: donation.food_category,
        quantity_value: donation.quantity_value,
        quantity_unit: donation.quantity_unit,
        total_weight_kg: donation.total_weight_kg,
        storage_condition: donation.storage_condition,
        packaging_type: donation.packaging_type,
        preparation_time: formatIsoForInput(donation.preparation_time),
        available_from: formatIsoForInput(donation.available_from),
        pickup_deadline: formatIsoForInput(donation.pickup_deadline),
        safe_consumption_deadline: formatIsoForInput(donation.safe_consumption_deadline),
        location: {
          latitude: donation.location.latitude,
          longitude: donation.location.longitude,
        },
        pickup_notes: donation.pickup_notes || "",
        image_url: donation.image_url || "",
      });
    }
  }, [donation, reset]);

  const isTerminal = donation ? TERMINAL_STATUSES.includes(donation.status) : false;

  const onSubmit = async (data: DonationFormData) => {
    setServerError(null);
    try {
      await updateMutation.mutateAsync({
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

      success("Donation details updated successfully.", "Donation Saved");
      router.push(`/app/business/donations/${donationId}`);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Could not update donation details. Please verify your inputs.";
      setServerError(msg);
      toastError(msg, "Update Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href={`/app/business/donations/${donationId}`}
            className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Donation Details
          </Link>
        </div>

        <PageHeader
          title="Edit Food Donation"
          description="Update quantities, packaging, and pickup deadlines for active matching."
        />

        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-72 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : isError || !donation ? (
          <Alert variant="error" title="Donation Not Found">
            Could not find donation record to edit.
          </Alert>
        ) : isTerminal ? (
          <Alert variant="warning" title="Cannot Edit Terminal Donation">
            This donation is in status {donation.status} and can no longer be edited.
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Update Donation Details</CardTitle>
              <CardDescription>
                Modifications will immediately take effect for matching organizations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {serverError && (
                  <Alert
                    variant="error"
                    title="Could Not Save Changes"
                    onDismiss={() => setServerError(null)}
                  >
                    {serverError}
                  </Alert>
                )}

                {/* Title & Category */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Donation Title"
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
                    error={errors.total_weight_kg?.message}
                    disabled={isSubmitting}
                    {...register("total_weight_kg", { valueAsNumber: true })}
                  />
                </div>

                {/* Storage & Packaging */}
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
                    error={errors.packaging_type?.message}
                    disabled={isSubmitting}
                    {...register("packaging_type")}
                  />
                </div>

                {/* Deadlines */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-4">
                  <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    Time Windows & Safety Deadlines
                  </h4>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Available From"
                      type="datetime-local"
                      error={errors.available_from?.message}
                      disabled={isSubmitting}
                      {...register("available_from")}
                    />

                    <Input
                      label="Pickup Deadline"
                      type="datetime-local"
                      error={errors.pickup_deadline?.message}
                      disabled={isSubmitting}
                      {...register("pickup_deadline")}
                    />

                    <Input
                      label="Safe Consumption Deadline"
                      type="datetime-local"
                      error={errors.safe_consumption_deadline?.message}
                      disabled={isSubmitting}
                      {...register("safe_consumption_deadline")}
                    />

                    <Input
                      label="Preparation / Cooking Time (Optional)"
                      type="datetime-local"
                      error={errors.preparation_time?.message}
                      disabled={isSubmitting}
                      {...register("preparation_time")}
                    />
                  </div>
                </div>

                {/* Location Coordinates & Map Picker */}
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

                {/* Notes */}
                <Textarea
                  label="Pickup Notes / Driver Instructions"
                  error={errors.pickup_notes?.message}
                  disabled={isSubmitting}
                  rows={3}
                  {...register("pickup_notes")}
                />

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-100">
                  <Link href={`/app/business/donations/${donationId}`}>
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
                    leftIcon={<Save className="h-4 w-4 mr-1" />}
                  >
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
