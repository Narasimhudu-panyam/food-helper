"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Layers,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useOrganizationProfile,
  useUpdateOrganizationProfile,
} from "@/hooks/use-organization-profile";
import {
  OrganizationCapacityFormData,
  organizationCapacitySchema,
} from "@/lib/validation/organization-capacity";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationCapacityPage() {
  const { data: profile, isLoading, isError, refetch } = useOrganizationProfile();
  const updateMutation = useUpdateOrganizationProfile();
  const { success, error: toastError } = useToast();

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationCapacityFormData>({
    resolver: zodResolver(organizationCapacitySchema),
    defaultValues: {
      max_capacity_kg: 0,
      current_capacity_kg: 0,
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        max_capacity_kg: Number(profile.max_capacity_kg),
        current_capacity_kg: Number(profile.current_capacity_kg),
      });
    }
  }, [profile, reset]);

  const watchedMax = watch("max_capacity_kg") || 0;
  const watchedCurrent = watch("current_capacity_kg") || 0;
  const computedAvailable = Math.max(0, watchedMax - watchedCurrent);
  const usagePercentage =
    watchedMax > 0 ? Math.min(100, Math.round((watchedCurrent / watchedMax) * 100)) : 0;

  const onSubmit = async (data: OrganizationCapacityFormData) => {
    setServerError(null);
    try {
      await updateMutation.mutateAsync({
        max_capacity_kg: Number(data.max_capacity_kg),
        current_capacity_kg: Number(data.current_capacity_kg),
      });
      success("Storage capacity limits have been updated.", "Capacity Updated");
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Failed to update organization capacity. Ensure current capacity does not exceed maximum capacity.";
      setServerError(msg);
      toastError(msg, "Update Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["ORGANIZATION"]}>
      <PageContainer>
        <PageHeader
          title="Capacity Management"
          description="Monitor and configure your facility's storage and intake capacity in kilograms."
        />

        {isLoading ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3.5 w-72 mt-1" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : isError ? (
          <Alert variant="error" title="Failed to load capacity">
            Unable to retrieve current capacity configuration.
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
                You must complete your organization profile before managing storage capacity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/app/organization/profile">
                <Button size="sm" variant="primary">
                  Set Up Organization Profile
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Live Metrics Summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="border-emerald-200 bg-emerald-50/20">
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    Available Intake Space
                  </span>
                  <CardTitle className="text-2xl font-bold text-emerald-800">
                    {(Number(profile.max_capacity_kg) - Number(profile.current_capacity_kg)).toFixed(1)}{" "}
                    <span className="text-sm font-normal text-emerald-600">kg</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-emerald-700">
                    Open capacity available for incoming match reservations.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Current Occupied / Reserved
                  </span>
                  <CardTitle className="text-2xl font-bold text-zinc-900">
                    {Number(profile.current_capacity_kg).toFixed(1)}{" "}
                    <span className="text-sm font-normal text-zinc-500">kg</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-zinc-500">
                    Capacity reserved by accepted matches or existing stock.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Maximum Storage Limit
                  </span>
                  <CardTitle className="text-2xl font-bold text-zinc-900">
                    {Number(profile.max_capacity_kg).toFixed(1)}{" "}
                    <span className="text-sm font-normal text-zinc-500">kg</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-zinc-500">
                    Upper physical limit for your intake facility.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Capacity Update Form */}
            <Card>
              <CardHeader>
                <CardTitle>Update Capacity Parameters</CardTitle>
                <CardDescription>
                  Adjust your total facility capacity or current occupancy. The backend matching algorithm uses these limits to ensure you are never assigned more food than you can store.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  {serverError && (
                    <Alert
                      variant="error"
                      title="Could Not Update Capacity"
                      onDismiss={() => setServerError(null)}
                    >
                      {serverError}
                    </Alert>
                  )}

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

                    <Input
                      label="Current Occupied / Reserved Capacity (kg)"
                      type="number"
                      step="any"
                      placeholder="e.g. 50"
                      helperText="Current occupied stock. Automatically increments on match acceptance."
                      error={errors.current_capacity_kg?.message}
                      disabled={isSubmitting}
                      {...register("current_capacity_kg", { valueAsNumber: true })}
                    />
                  </div>

                  {/* Dynamic Preview Indicator */}
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-zinc-700">
                      <span>Live Utilization Simulation</span>
                      <span>{usagePercentage}% occupied</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          usagePercentage > 90
                            ? "bg-rose-500"
                            : usagePercentage > 70
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${usagePercentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-zinc-500">
                      Remaining available space after changes:{" "}
                      <span className="font-semibold text-zinc-800">
                        {computedAvailable.toFixed(1)} kg
                      </span>
                    </p>
                  </div>

                  <div className="rounded-lg bg-sky-50 border border-sky-200 p-3.5 flex items-start space-x-2 text-sky-800">
                    <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
                    <p className="text-xs leading-relaxed">
                      <strong>Atomic Reservation Guarantee:</strong> When you accept an incoming match offer, the system uses PostgreSQL row-level locks to atomically verify and reserve capacity, eliminating over-allocation risks.
                    </p>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={isSubmitting}
                      leftIcon={<Save className="h-4 w-4 mr-1" />}
                    >
                      Save Capacity Limits
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
