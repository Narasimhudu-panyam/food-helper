"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Info,
  MapPin,
  Power,
  ShieldAlert,
  ThermometerSnowflake,
  Truck,
  Users,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useToggleVolunteerAvailability,
  useVolunteerProfile,
} from "@/hooks/use-volunteer-profile";
import { useAssignVolunteer } from "@/hooks/use-pickups";
import {
  PickupClaimFormData,
  pickupClaimSchema,
} from "@/lib/validation/pickup-action";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function VolunteerAvailablePickupsPage() {
  const router = useRouter();
  const { data: profile, isLoading, isError, refetch } = useVolunteerProfile();
  const toggleAvailabilityMutation = useToggleVolunteerAvailability();
  const assignMutation = useAssignVolunteer();
  const { success, error: toastError } = useToast();

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PickupClaimFormData>({
    resolver: zodResolver(pickupClaimSchema),
    defaultValues: {
      pickup_id: "",
    },
  });

  const handleToggleAvailability = async () => {
    if (!profile) return;
    try {
      const nextState = !profile.is_available;
      await toggleAvailabilityMutation.mutateAsync(nextState);
      success(
        nextState
          ? "You are now online and eligible for dispatch matching."
          : "You are now off-duty. Dispatch matching will pause.",
        nextState ? "Available for Dispatch" : "Off-Duty"
      );
    } catch (err: any) {
      const msg = err?.detail || "Failed to update availability.";
      toastError(msg, "Update Failed");
    }
  };

  const onClaimSubmit = async (data: PickupClaimFormData) => {
    setServerError(null);
    try {
      const pickup = await assignMutation.mutateAsync({
        pickupId: data.pickup_id,
      });
      success("Transport task claimed successfully! Redirecting to delivery details...", "Task Claimed");
      reset();
      router.push(`/app/volunteer/pickups/${pickup.id}`);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Failed to claim pickup. It may already be assigned, the donation may not require volunteer transport, or your profile may not meet thermal/vehicle requirements.";
      setServerError(msg);
      toastError(msg, "Claim Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["VOLUNTEER"]}>
      <PageContainer>
        <PageHeader
          title="Available Pickups & Dispatch Status"
          description="Monitor your active dispatch eligibility and claim incoming transport coordination tasks."
        />

        {isLoading ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3.5 w-72 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : isError ? (
          <Alert variant="error" title="Failed to load volunteer status">
            Unable to connect to the volunteer dispatch service.
            <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-2">
              Retry
            </Button>
          </Alert>
        ) : !profile ? (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader>
              <div className="flex items-center space-x-2 text-amber-800">
                <AlertCircle className="h-4 w-4" />
                <CardTitle className="text-amber-900">
                  Profile Setup Required
                </CardTitle>
              </div>
              <CardDescription className="text-amber-700">
                Complete your courier profile with vehicle specifications and service radius before you can be matched with transport tasks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/app/volunteer/profile">
                <Button size="sm" variant="primary">
                  Set Up Volunteer Profile
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Live Dispatch Status Card */}
            <Card className={profile.is_available ? "border-emerald-200 bg-emerald-50/20" : "border-zinc-200 bg-zinc-50/40"}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <CardTitle className="text-base text-zinc-900">
                      Dispatch Availability Status
                    </CardTitle>
                    {profile.is_available ? (
                      <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Online & Ready</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-xs font-semibold text-zinc-600 bg-zinc-100 px-2.5 py-0.5 rounded border border-zinc-200">
                        <Power className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Offline / Off-Duty</span>
                      </span>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {profile.is_available
                      ? "The automated dispatch engine actively evaluates your profile for compatible nearby surplus food pickups."
                      : "You are currently off-duty. You will not be included in new pickup dispatch candidate rankings."}
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant={profile.is_available ? "outline" : "primary"}
                  onClick={handleToggleAvailability}
                  isLoading={toggleAvailabilityMutation.isPending}
                  leftIcon={<Power className="h-3.5 w-3.5 mr-1" />}
                >
                  {profile.is_available ? "Go Off-Duty" : "Go Online"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 pt-2">
                  <div className="rounded-lg bg-white p-3 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Transport Type
                    </span>
                    <div className="mt-1 flex items-center space-x-1.5">
                      <Truck className="h-3.5 w-3.5 text-zinc-500" />
                      <p className="text-xs font-semibold text-zinc-800">
                        {profile.vehicle_type.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Thermal Bags
                    </span>
                    <div className="mt-1 flex items-center space-x-1.5">
                      <ThermometerSnowflake className="h-3.5 w-3.5 text-zinc-500" />
                      <p className="text-xs font-medium text-zinc-800">
                        {profile.has_insulated_bags ? "Ready" : "Ambient Only"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Service Radius
                    </span>
                    <div className="mt-1 flex items-center space-x-1.5">
                      <Compass className="h-3.5 w-3.5 text-zinc-500" />
                      <p className="text-xs font-bold text-zinc-900">
                        {Number(profile.service_radius_km).toFixed(1)} km
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Home Location
                    </span>
                    <div className="mt-1 flex items-center space-x-1.5">
                      <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                      <p className="text-xs font-mono text-zinc-700">
                        {profile.home_location
                          ? `${profile.home_location.latitude.toFixed(2)}, ${profile.home_location.longitude.toFixed(2)}`
                          : "Not set"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Direct Task Claim Card */}
            <Card>
              <CardHeader>
                <CardTitle>Claim Pickup Task by Reference</CardTitle>
                <CardDescription>
                  When you receive a dispatch alert notification with a pickup task UUID, enter it below to claim the delivery.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onClaimSubmit)} className="space-y-4">
                  {serverError && (
                    <Alert
                      variant="error"
                      title="Could Not Claim Pickup"
                      onDismiss={() => setServerError(null)}
                    >
                      {serverError}
                    </Alert>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        error={errors.pickup_id?.message}
                        disabled={isSubmitting}
                        {...register("pickup_id")}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={isSubmitting}
                      disabled={!profile.is_available}
                    >
                      Claim Pickup Task
                    </Button>
                  </div>
                  {!profile.is_available && (
                    <p className="text-xs text-amber-700">
                      You must toggle your status to <strong>Available</strong> before claiming a transport task.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>

            {/* Dispatch Architecture Information */}
            <div className="rounded-lg bg-sky-50 border border-sky-200 p-4 space-y-2 text-sky-900">
              <div className="flex items-center space-x-2 font-semibold text-xs">
                <Info className="h-4 w-4 text-sky-700 shrink-0" />
                <span>How Volunteer Dispatch Works</span>
              </div>
              <p className="text-xs text-sky-800 leading-relaxed">
                Our matching system is built around privacy and deterministic dispatch scoring. When a food donation match requires courier delivery, the backend calculates spatial distance, vehicle suitability, and thermal equipment requirements for online volunteers. Matched volunteers receive direct dispatch alerts.
              </p>
            </div>
          </div>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
