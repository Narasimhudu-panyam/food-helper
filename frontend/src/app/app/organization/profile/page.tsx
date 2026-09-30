"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  CheckCircle2,
  Clock,
  Edit2,
  Layers,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useCreateOrganizationProfile,
  useOrganizationProfile,
  useUpdateOrganizationProfile,
} from "@/hooks/use-organization-profile";
import {
  FOOD_CATEGORY_OPTIONS,
  ORG_TYPE_OPTIONS,
  OrganizationProfileFormData,
  organizationProfileSchema,
} from "@/lib/validation/organization-profile";
import { OrgType, OrgVerificationStatus } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationMap } from "@/components/maps/location-map";
import { CoordinateInput } from "@/components/maps/coordinate-input";

function VerificationBadge({ status }: { status: OrgVerificationStatus }) {
  switch (status) {
    case "VERIFIED":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span>Verified Partner</span>
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          <span>Verification Under Review</span>
        </span>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
          <XCircle className="h-3.5 w-3.5 text-rose-600" />
          <span>Verification Rejected</span>
        </span>
      );
    case "SUSPENDED":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
          <span>Account Suspended</span>
        </span>
      );
    default:
      return null;
  }
}

export default function OrganizationProfilePage() {
  const { data: profile, isLoading, isError, refetch } = useOrganizationProfile();
  const createMutation = useCreateOrganizationProfile();
  const updateMutation = useUpdateOrganizationProfile();
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
  } = useForm<OrganizationProfileFormData>({
    resolver: zodResolver(organizationProfileSchema),
    defaultValues: {
      org_name: "",
      org_type: "FOOD_BANK",
      tax_id: "",
      address_text: "",
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
      contact_phone: "",
      max_capacity_kg: 500,
      accepted_categories: ["PREPARED_MEALS", "BAKERY", "PRODUCE", "PACKAGED"],
      can_pickup: true,
    },
  });

  const selectedCategories = watch("accepted_categories") || [];
  const canPickupValue = watch("can_pickup");

  // Populate form values when profile is loaded
  useEffect(() => {
    if (profile) {
      reset({
        org_name: profile.org_name,
        org_type: profile.org_type,
        tax_id: profile.tax_id || "",
        address_text: profile.address_text,
        location: {
          latitude: profile.location.latitude,
          longitude: profile.location.longitude,
        },
        contact_phone: profile.contact_phone,
        max_capacity_kg: Number(profile.max_capacity_kg),
        accepted_categories: profile.accepted_categories || [],
        can_pickup: profile.can_pickup,
      });
    } else if (!isLoading && !profile) {
      setIsEditing(true); // Automatically enter setup mode if profile doesn't exist
    }
  }, [profile, isLoading, reset]);

  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setValue(
        "accepted_categories",
        selectedCategories.filter((c) => c !== cat),
        { shouldValidate: true }
      );
    } else {
      setValue("accepted_categories", [...selectedCategories, cat], {
        shouldValidate: true,
      });
    }
  };

  const onSubmit = async (data: OrganizationProfileFormData) => {
    setServerError(null);
    try {
      if (profile) {
        // Update existing profile
        await updateMutation.mutateAsync({
          org_name: data.org_name,
          org_type: data.org_type as OrgType,
          tax_id: data.tax_id || null,
          address_text: data.address_text,
          location: {
            latitude: Number(data.location.latitude),
            longitude: Number(data.location.longitude),
          },
          contact_phone: data.contact_phone,
          max_capacity_kg: Number(data.max_capacity_kg),
          accepted_categories: data.accepted_categories,
          can_pickup: data.can_pickup,
        });
        success("Organization profile updated successfully.", "Profile Saved");
      } else {
        // Create initial profile
        await createMutation.mutateAsync({
          org_name: data.org_name,
          org_type: data.org_type as OrgType,
          tax_id: data.tax_id || null,
          address_text: data.address_text,
          location: {
            latitude: Number(data.location.latitude),
            longitude: Number(data.location.longitude),
          },
          contact_phone: data.contact_phone,
          max_capacity_kg: Number(data.max_capacity_kg),
          accepted_categories: data.accepted_categories,
          can_pickup: data.can_pickup,
        });
        success("Organization profile created successfully.", "Profile Active");
      }
      setIsEditing(false);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "An error occurred while saving organization profile. Please verify your data.";
      setServerError(msg);
      toastError(msg, "Save Failed");
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      reset({
        org_name: profile.org_name,
        org_type: profile.org_type,
        tax_id: profile.tax_id || "",
        address_text: profile.address_text,
        location: {
          latitude: profile.location.latitude,
          longitude: profile.location.longitude,
        },
        contact_phone: profile.contact_phone,
        max_capacity_kg: Number(profile.max_capacity_kg),
        accepted_categories: profile.accepted_categories || [],
        can_pickup: profile.can_pickup,
      });
      setIsEditing(false);
      setServerError(null);
    }
  };

  return (
    <AuthGuard allowedRoles={["ORGANIZATION"]}>
      <PageContainer>
        <PageHeader
          title="Organization Profile"
          description="Configure your intake facility location, storage capacity, and accepted food categories."
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
            Unable to connect to the organization profile service.
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
              <CardTitle>Organization Profile Setup Required</CardTitle>
              <CardDescription>
                Your account does not have an active organization profile registered yet.
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
                {profile ? "Edit Organization Profile" : "Register Organization Profile"}
              </CardTitle>
              <CardDescription>
                Accurate facility location and accepted categories ensure matching compatibility with nearby donors.
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
                    label="Organization Legal / Operating Name"
                    placeholder="e.g. City Harvest Food Bank"
                    error={errors.org_name?.message}
                    disabled={isSubmitting}
                    {...register("org_name")}
                  />

                  <Select
                    label="Organization Type"
                    options={ORG_TYPE_OPTIONS}
                    error={errors.org_type?.message}
                    disabled={isSubmitting}
                    {...register("org_type")}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Tax ID / Charity Registration (Optional)"
                    placeholder="e.g. 501(c)(3) EIN: XX-XXXXXXX"
                    error={errors.tax_id?.message}
                    disabled={isSubmitting}
                    {...register("tax_id")}
                  />

                  <Input
                    label="Operations Contact Phone"
                    placeholder="e.g. +1 (555) 234-5678"
                    error={errors.contact_phone?.message}
                    disabled={isSubmitting}
                    {...register("contact_phone")}
                  />
                </div>

                <Input
                  label="Physical Intake Address"
                  placeholder="e.g. 450 Mission St, San Francisco, CA 94105"
                  error={errors.address_text?.message}
                  disabled={isSubmitting}
                  {...register("address_text")}
                />

                {/* Geographic Facility Coordinates & Map Picker */}
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
                  label="Organization Facility Geographic Coordinates"
                  helperText="Exact coordinates used by PostGIS to calculate proximity and match score"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Maximum Storage Capacity (kg)"
                    type="number"
                    step="any"
                    placeholder="e.g. 500"
                    helperText="Total maximum storage limit of your facility."
                    error={errors.max_capacity_kg?.message}
                    disabled={isSubmitting}
                    {...register("max_capacity_kg", { valueAsNumber: true })}
                  />

                  <div className="flex flex-col justify-center pt-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700 mb-1">
                      Direct Transport Capability
                    </label>
                    <label className="flex items-center space-x-2 text-xs text-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                        checked={canPickupValue}
                        onChange={(e) => setValue("can_pickup", e.target.checked)}
                      />
                      <span>Organization has staff or vehicles capable of self-pickup</span>
                    </label>
                  </div>
                </div>

                {/* Food Categories Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                    Accepted Food Categories
                  </label>
                  <p className="text-xs text-zinc-500">
                    Select all food categories your facility has equipment and capacity to safely store.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                    {FOOD_CATEGORY_OPTIONS.map((cat) => {
                      const isChecked = selectedCategories.includes(cat.value);
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => toggleCategory(cat.value)}
                          className={`flex items-center justify-between p-2.5 text-xs rounded-lg border text-left transition-colors ${
                            isChecked
                              ? "bg-sky-50 border-sky-300 text-sky-900 font-semibold"
                              : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                          }`}
                        >
                          <span>{cat.label}</span>
                          {isChecked && <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                  {errors.accepted_categories && (
                    <p className="text-xs text-rose-600 mt-1">
                      {errors.accepted_categories.message}
                    </p>
                  )}
                </div>

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
                    {profile ? "Save Profile Changes" : "Register Organization Profile"}
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
                        {profile.org_name}
                      </CardTitle>
                      <VerificationBadge status={profile.verification_status} />
                    </div>
                    <CardDescription className="mt-1">
                      {profile.org_type.replace(/_/g, " ")} • Registered Relief Organization
                      {profile.tax_id && ` • Tax ID: ${profile.tax_id}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Physical Intake Location
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
                      Direct Contact Phone
                    </span>
                    <div className="mt-2 flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-medium text-zinc-900">
                        {profile.contact_phone}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Max Storage Capacity
                    </span>
                    <div className="mt-2 flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-bold text-zinc-900">
                        {Number(profile.max_capacity_kg).toFixed(1)} kg
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Transport Capability
                    </span>
                    <div className="mt-2 flex items-center space-x-2">
                      <Truck className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-medium text-zinc-900">
                        {profile.can_pickup
                          ? "Self-Pickup Capable (Staff/Vehicles Available)"
                          : "Volunteer Courier Dependent"}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Accepted Food Categories
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.accepted_categories.map((cat) => (
                      <Badge key={cat} variant="default" size="sm">
                        {cat.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Organization Location Map Preview */}
                <div className="pt-2 border-t border-zinc-100">
                  <LocationMap
                    title="Organization Location"
                    center={{
                      latitude: profile.location.latitude,
                      longitude: profile.location.longitude,
                    }}
                    markers={[
                      {
                        position: profile.location,
                        title: profile.org_name,
                        description: profile.address_text,
                        variant: "organization",
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
