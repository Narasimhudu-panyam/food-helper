"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  CheckCircle2,
  Edit2,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  X,
} from "lucide-react";

import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useBusinessProfile,
  useCreateBusinessProfile,
  useUpdateBusinessProfile,
} from "@/hooks/use-business-profile";
import {
  BusinessProfileFormData,
  businessProfileSchema,
} from "@/lib/validation/business-profile";
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
import { BusinessType } from "@/types";
import { LocationMap } from "@/components/maps/location-map";
import { CoordinateInput } from "@/components/maps/coordinate-input";

const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string }> = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "SUPERMARKET", label: "Supermarket / Grocery" },
  { value: "BAKERY", label: "Bakery" },
  { value: "HOTEL", label: "Hotel / Hospitality" },
  { value: "CATERER", label: "Catering Company" },
  { value: "OTHER", label: "Other Commercial Kitchen" },
];

export default function FoodBusinessProfilePage() {
  const { success, error: toastError } = useToast();
  const { data: profile, isLoading, isError, refetch } = useBusinessProfile();
  const createMutation = useCreateBusinessProfile();
  const updateMutation = useUpdateBusinessProfile();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BusinessProfileFormData>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      business_name: "",
      business_type: "RESTAURANT",
      address_text: "",
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
      contact_phone: "",
      pickup_instructions: "",
    },
  });

  // Populate form values when profile is loaded
  useEffect(() => {
    if (profile) {
      reset({
        business_name: profile.business_name,
        business_type: profile.business_type,
        address_text: profile.address_text,
        location: {
          latitude: profile.location.latitude,
          longitude: profile.location.longitude,
        },
        contact_phone: profile.contact_phone,
        pickup_instructions: profile.pickup_instructions || "",
      });
    } else if (!isLoading && !profile) {
      setIsEditing(true); // Automatically enter setup mode if profile doesn't exist
    }
  }, [profile, isLoading, reset]);

  const onSubmit = async (data: BusinessProfileFormData) => {
    setServerError(null);
    try {
      if (profile) {
        // Update existing profile
        await updateMutation.mutateAsync({
          business_name: data.business_name,
          business_type: data.business_type as BusinessType,
          address_text: data.address_text,
          location: {
            latitude: Number(data.location.latitude),
            longitude: Number(data.location.longitude),
          },
          contact_phone: data.contact_phone,
          pickup_instructions: data.pickup_instructions || null,
        });
        success("Your business profile has been updated.", "Profile Saved");
      } else {
        // Create initial profile
        await createMutation.mutateAsync({
          business_name: data.business_name,
          business_type: data.business_type as BusinessType,
          address_text: data.address_text,
          location: {
            latitude: Number(data.location.latitude),
            longitude: Number(data.location.longitude),
          },
          contact_phone: data.contact_phone,
          pickup_instructions: data.pickup_instructions || null,
        });
        success("Your business profile is now active.", "Profile Created");
      }
      setIsEditing(false);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "An error occurred while saving your business profile. Please verify your details.";
      setServerError(msg);
      toastError(msg, "Save Failed");
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      reset({
        business_name: profile.business_name,
        business_type: profile.business_type,
        address_text: profile.address_text,
        location: {
          latitude: profile.location.latitude,
          longitude: profile.location.longitude,
        },
        contact_phone: profile.contact_phone,
        pickup_instructions: profile.pickup_instructions || "",
      });
      setIsEditing(false);
    }
  };

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <PageHeader
          title="Business Profile"
          description="Configure your physical establishment location, business details, and driver pickup instructions."
          actions={
            profile &&
            !isEditing && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Edit2 className="h-3.5 w-3.5 mr-1" />}
                onClick={() => setIsEditing(true)}
              >
                Edit Profile
              </Button>
            )
          }
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
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ) : isError ? (
          <Alert variant="error" title="Failed to load profile">
            Unable to connect to the profile service.
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-3"
              leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
            >
              Retry
            </Button>
          </Alert>
        ) : !profile && !isEditing ? (
          <Card>
            <CardHeader>
              <CardTitle>Business Profile Setup Required</CardTitle>
              <CardDescription>
                Your account does not have a business profile registered yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="primary" onClick={() => setIsEditing(true)}>
                Complete Profile Setup
              </Button>
            </CardContent>
          </Card>
        ) : isEditing ? (
          /* Profile Edit / Creation Form */
          <Card>
            <CardHeader>
              <CardTitle>
                {profile ? "Edit Business Profile" : "Register Business Profile"}
              </CardTitle>
              <CardDescription>
                Ensure geographic coordinates and address correspond accurately to your loading or pickup area.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {serverError && (
                  <Alert
                    variant="error"
                    title="Could Not Save Profile"
                    onDismiss={() => setServerError(null)}
                  >
                    {serverError}
                  </Alert>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Business / Establishment Name"
                    placeholder="e.g. Bella Italia Bistro"
                    error={errors.business_name?.message}
                    disabled={isSubmitting}
                    {...register("business_name")}
                  />

                  <Select
                    label="Business Type"
                    options={BUSINESS_TYPE_OPTIONS}
                    error={errors.business_type?.message}
                    disabled={isSubmitting}
                    {...register("business_type")}
                  />
                </div>

                <Input
                  label="Physical Street Address"
                  placeholder="e.g. 100 Main St, Suite 400, San Francisco, CA"
                  error={errors.address_text?.message}
                  disabled={isSubmitting}
                  {...register("address_text")}
                />

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
                  label="Business Geographic Coordinates"
                  helperText="Exact coordinates for driver dispatch and spatial matching"
                />

                <Input
                  label="Contact Phone Number"
                  placeholder="e.g. +1 (555) 234-5678"
                  error={errors.contact_phone?.message}
                  disabled={isSubmitting}
                  {...register("contact_phone")}
                />

                <Textarea
                  label="Driver Pickup Instructions (Optional)"
                  placeholder="e.g. Ring buzzer at rear kitchen dock; ask for Shift Lead."
                  error={errors.pickup_instructions?.message}
                  disabled={isSubmitting}
                  rows={3}
                  {...register("pickup_instructions")}
                />

                <div className="flex items-center justify-end space-x-3 pt-2">
                  {profile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={handleCancelEdit}
                      disabled={isSubmitting}
                      leftIcon={<X className="h-4 w-4 mr-1" />}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSubmitting}
                    leftIcon={<Save className="h-4 w-4 mr-1" />}
                  >
                    {profile ? "Save Changes" : "Create Profile"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : profile ? (
          /* Profile Read-Only View */
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-zinc-900">
                      {profile.business_name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {profile.business_type.replace(/_/g, " ")} • Registered Commercial Food Provider
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Profile Active</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Physical Pickup Location
                    </span>
                    <div className="mt-2 flex items-start space-x-2">
                      <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-zinc-900 leading-tight">
                          {profile.address_text}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                          Coordinates: {profile.location.latitude.toFixed(4)}, {profile.location.longitude.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Direct Contact
                    </span>
                    <div className="mt-2 flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-medium text-zinc-900">
                        {profile.contact_phone}
                      </p>
                    </div>
                  </div>
                </div>

                {profile.pickup_instructions && (
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Driver Pickup Instructions
                    </span>
                    <p className="mt-1.5 text-xs text-zinc-700 leading-relaxed">
                      {profile.pickup_instructions}
                    </p>
                  </div>
                )}

                {/* Location Map Preview */}
                <div className="pt-2 border-t border-zinc-100">
                  <LocationMap
                    title="Business Location"
                    center={{
                      latitude: profile.location.latitude,
                      longitude: profile.location.longitude,
                    }}
                    markers={[
                      {
                        position: profile.location,
                        title: profile.business_name,
                        description: profile.address_text,
                        variant: "business",
                      },
                    ]}
                    height="260px"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </PageContainer>
    </AuthGuard>
  );
}
