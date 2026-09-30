"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  Compass,
  Edit2,
  MapPin,
  Phone,
  Power,
  RotateCcw,
  Save,
  ThermometerSnowflake,
  Truck,
  Users,
  X,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useCreateVolunteerProfile,
  useUpdateVolunteerProfile,
  useVolunteerProfile,
} from "@/hooks/use-volunteer-profile";
import {
  VEHICLE_TYPE_OPTIONS,
  VolunteerProfileFormData,
  volunteerProfileSchema,
} from "@/lib/validation/volunteer-profile";
import { VehicleType } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationMap } from "@/components/maps/location-map";
import { CoordinateInput } from "@/components/maps/coordinate-input";

export default function VolunteerProfilePage() {
  const { data: profile, isLoading, isError, refetch } = useVolunteerProfile();
  const createMutation = useCreateVolunteerProfile();
  const updateMutation = useUpdateVolunteerProfile();
  const { success, error: toastError } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VolunteerProfileFormData>({
    resolver: zodResolver(volunteerProfileSchema),
    defaultValues: {
      full_name: "",
      contact_phone: "",
      vehicle_type: "CAR",
      has_insulated_bags: false,
      service_radius_km: 10,
      home_location: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
    },
  });

  const hasInsulatedBagsValue = watch("has_insulated_bags");

  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name,
        contact_phone: profile.contact_phone,
        vehicle_type: profile.vehicle_type,
        has_insulated_bags: profile.has_insulated_bags,
        service_radius_km: Number(profile.service_radius_km),
        home_location: profile.home_location
          ? {
              latitude: profile.home_location.latitude,
              longitude: profile.home_location.longitude,
            }
          : {
              latitude: 37.7749,
              longitude: -122.4194,
            },
      });
    } else if (!isLoading && !profile) {
      setIsEditing(true);
    }
  }, [profile, isLoading, reset]);

  const onSubmit = async (data: VolunteerProfileFormData) => {
    setServerError(null);
    try {
      if (profile) {
        await updateMutation.mutateAsync({
          full_name: data.full_name,
          contact_phone: data.contact_phone,
          vehicle_type: data.vehicle_type as VehicleType,
          has_insulated_bags: data.has_insulated_bags,
          service_radius_km: Number(data.service_radius_km),
          home_location: data.home_location
            ? {
                latitude: Number(data.home_location.latitude),
                longitude: Number(data.home_location.longitude),
              }
            : null,
        });
        success("Volunteer transport profile updated successfully.", "Profile Saved");
      } else {
        await createMutation.mutateAsync({
          full_name: data.full_name,
          contact_phone: data.contact_phone,
          vehicle_type: data.vehicle_type as VehicleType,
          has_insulated_bags: data.has_insulated_bags,
          service_radius_km: Number(data.service_radius_km),
          home_location: data.home_location
            ? {
                latitude: Number(data.home_location.latitude),
                longitude: Number(data.home_location.longitude),
              }
            : null,
        });
        success("Volunteer transport profile created successfully.", "Profile Created");
      }
      setIsEditing(false);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "An error occurred while saving volunteer profile. Please verify your details.";
      setServerError(msg);
      toastError(msg, "Save Failed");
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      reset({
        full_name: profile.full_name,
        contact_phone: profile.contact_phone,
        vehicle_type: profile.vehicle_type,
        has_insulated_bags: profile.has_insulated_bags,
        service_radius_km: Number(profile.service_radius_km),
        home_location: profile.home_location
          ? {
              latitude: profile.home_location.latitude,
              longitude: profile.home_location.longitude,
            }
          : null,
      });
      setIsEditing(false);
      setServerError(null);
    }
  };

  return (
    <AuthGuard allowedRoles={["VOLUNTEER"]}>
      <PageContainer>
        <PageHeader
          title="Volunteer Profile"
          description="Configure your vehicle transport capabilities, equipment, and geographical service radius."
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
            Unable to connect to the volunteer profile service.
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
              <CardTitle>Volunteer Profile Setup Required</CardTitle>
              <CardDescription>
                Register your vehicle and service range to receive automated courier dispatch matching.
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
                {profile ? "Edit Volunteer Profile" : "Register Volunteer Courier Profile"}
              </CardTitle>
              <CardDescription>
                Ensure contact phone and home departure coordinates accurately represent your operational location.
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
                    label="Full Name"
                    placeholder="e.g. Jane Doe"
                    error={errors.full_name?.message}
                    disabled={isSubmitting}
                    {...register("full_name")}
                  />

                  <Input
                    label="Mobile Contact Phone"
                    placeholder="e.g. +1 (555) 987-6543"
                    error={errors.contact_phone?.message}
                    disabled={isSubmitting}
                    {...register("contact_phone")}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    label="Vehicle / Transport Type"
                    options={VEHICLE_TYPE_OPTIONS}
                    error={errors.vehicle_type?.message}
                    disabled={isSubmitting}
                    {...register("vehicle_type")}
                  />

                  <Input
                    label="Maximum Travel Service Radius (km)"
                    type="number"
                    step="any"
                    placeholder="e.g. 15"
                    helperText="Max distance from home base you are willing to courier."
                    error={errors.service_radius_km?.message}
                    disabled={isSubmitting}
                    {...register("service_radius_km", { valueAsNumber: true })}
                  />
                </div>

                {/* Thermal Equipment Checkbox */}
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                    Thermal Equipment & Food Safety
                  </label>
                  <label className="flex items-center space-x-2.5 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                      checked={hasInsulatedBagsValue}
                      onChange={(e) => setValue("has_insulated_bags", e.target.checked)}
                    />
                    <span className="text-xs text-zinc-800">
                      I have insulated hot/cold transport bags or portable coolers for temperature-controlled food.
                    </span>
                  </label>
                  <p className="text-[11px] text-zinc-500 pt-0.5">
                    Required for refrigerated, frozen, or hot-holding food transport tasks.
                  </p>
                </div>

                {/* Home Departure Coordinates & Map Picker */}
                <CoordinateInput
                  latitude={watch("home_location.latitude")}
                  longitude={watch("home_location.longitude")}
                  onChange={(coords) => {
                    setValue("home_location.latitude", coords.latitude, { shouldValidate: true });
                    setValue("home_location.longitude", coords.longitude, { shouldValidate: true });
                  }}
                  latError={errors.home_location?.latitude?.message}
                  lngError={errors.home_location?.longitude?.message}
                  disabled={isSubmitting}
                  label="Home Base / Departure Coordinates"
                  helperText="Exact coordinates used by PostGIS to match pickup opportunities within your travel radius"
                />

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-200">
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
                    {profile ? "Save Profile Changes" : "Register Volunteer Profile"}
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
                    <div className="flex items-center space-x-2.5">
                      <CardTitle className="text-lg font-bold text-zinc-900">
                        {profile.full_name}
                      </CardTitle>
                      {profile.is_available ? (
                        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Available for Dispatch</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-zinc-600 bg-zinc-100 px-2.5 py-0.5 rounded-md border border-zinc-200">
                          <Power className="h-3.5 w-3.5 text-zinc-500" />
                          <span>Off-Duty / Paused</span>
                        </span>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      Community Food Transport Courier • Phone: {profile.contact_phone}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Vehicle Type
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Truck className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-semibold text-zinc-900">
                        {profile.vehicle_type.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Insulated Equipment
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <ThermometerSnowflake className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-medium text-zinc-900">
                        {profile.has_insulated_bags
                          ? "Insulated Bags Ready (Refrigerated/Hot Capable)"
                          : "Ambient Only"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Service Radius
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Compass className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-bold text-zinc-900">
                        {Number(profile.service_radius_km).toFixed(1)} km
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Home Base / Departure Location
                  </span>
                  <div className="mt-2 flex items-start space-x-2">
                    <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-mono font-medium text-zinc-900">
                        {profile.home_location
                          ? `Latitude: ${profile.home_location.latitude.toFixed(4)}, Longitude: ${profile.home_location.longitude.toFixed(4)}`
                          : "Home location coordinates not configured"}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        PostGIS calculates transport match eligibility and proximity from these coordinates.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Volunteer Home Base & Service Radius Map Preview */}
                {profile.home_location && (
                  <div className="pt-2 border-t border-zinc-100">
                    <LocationMap
                      title="Home Base & Service Area"
                      center={profile.home_location}
                      markers={[
                        {
                          position: profile.home_location,
                          title: "Volunteer Home Base",
                          description: `Service Radius: ${Number(profile.service_radius_km).toFixed(1)} km`,
                          variant: "volunteer",
                          radiusKm: Number(profile.service_radius_km),
                        },
                      ]}
                      showServiceRadius={true}
                      serviceRadiusKm={Number(profile.service_radius_km)}
                      height="260px"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </PageContainer>
    </AuthGuard>
  );
}
