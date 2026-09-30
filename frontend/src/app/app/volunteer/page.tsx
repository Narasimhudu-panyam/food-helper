"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  Phone,
  Power,
  RotateCcw,
  Scale,
  Settings,
  ShieldCheck,
  ThermometerSnowflake,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useToggleVolunteerAvailability,
  useVolunteerProfile,
} from "@/hooks/use-volunteer-profile";
import { useVolunteerPickups } from "@/hooks/use-pickups";
import { useAnalyticsOverview } from "@/hooks/use-analytics";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { KpiCard } from "@/components/analytics/kpi-card";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { TrendChart } from "@/components/analytics/trend-chart";
import { CategoryChart } from "@/components/analytics/category-chart";
import { TimeRangePreset } from "@/types";

export default function VolunteerOverviewPage() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("30d");

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useVolunteerProfile();

  const {
    data: pickups,
    isLoading: pickupsLoading,
    isError: pickupsError,
    refetch: refetchPickups,
  } = useVolunteerPickups({ limit: 5 });

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useAnalyticsOverview({ timeRange });

  const toggleAvailabilityMutation = useToggleVolunteerAvailability();
  const { success, error: toastError } = useToast();

  const summary = analytics?.summary;
  const roleMetrics = analytics?.role_metrics || {};

  const handleToggleAvailability = async () => {
    if (!profile) return;
    try {
      const nextState = !profile.is_available;
      await toggleAvailabilityMutation.mutateAsync(nextState);
      success(
        nextState
          ? "You are now active and eligible for dispatch matching."
          : "You are now off-duty. Dispatch matching will pause.",
        nextState ? "Available for Dispatch" : "Off-Duty"
      );
    } catch (err: any) {
      const msg = err?.detail || "Failed to update availability status.";
      toastError(msg, "Status Update Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["VOLUNTEER"]}>
      <PageContainer>
        <PageHeader
          title="Volunteer"
          description="Manage your availability, transport surplus food, and review your personal courier delivery impact."
          badge={
            <Badge variant="info" size="sm">
              <Users className="mr-1 h-3 w-3 text-sky-600" />
              Community Courier
            </Badge>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <TimeRangeSelector
                value={timeRange}
                onChange={setTimeRange}
                disabled={analyticsLoading}
              />
              <Link href="/app/volunteer/available">
                <Button size="sm" variant="outline" leftIcon={<Compass className="h-4 w-4 mr-1" />}>
                  Available Pickups
                </Button>
              </Link>
              <Link href="/app/volunteer/pickups">
                <Button size="sm" variant="primary" leftIcon={<CalendarCheck className="h-4 w-4 mr-1" />}>
                  My Pickups
                </Button>
              </Link>
            </div>
          }
        />

        {/* Analytics KPI Section */}
        {analyticsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-5 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </Card>
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Completed Pickups"
              value={summary.delivered_pickups}
              subtitle={`${summary.active_pickups} active in transit`}
              icon={<Truck className="h-4 w-4" />}
              variant="emerald"
            />
            <KpiCard
              title="Food Delivered"
              value={`${summary.total_weight_kg_delivered.toLocaleString()} kg`}
              subtitle="transported to non-profit partners"
              icon={<Scale className="h-4 w-4" />}
              variant="sky"
            />
            <KpiCard
              title="Completion Rate"
              value={`${roleMetrics.completion_rate_pct ?? 100}%`}
              subtitle={`${summary.delivered_pickups} completed of ${summary.total_pickups} assigned`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              variant="indigo"
            />
            <KpiCard
              title="Service Coverage"
              value={`${roleMetrics.service_radius_km ?? (profile ? Number(profile.service_radius_km) : 0)} km`}
              subtitle={`${roleMetrics.vehicle_type?.replace(/_/g, " ") || (profile?.vehicle_type ? profile.vehicle_type.replace(/_/g, " ") : "Vehicle")} transport`}
              icon={<Compass className="h-4 w-4" />}
              variant="amber"
            />
          </div>
        ) : null}

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TrendChart
            title="Courier Delivery Timeline"
            subtitle="Daily weight (kg) of surplus food transported"
            data={analytics?.trends || []}
            metricKey="weight"
          />
          <CategoryChart
            title="Food Categories Transported"
            subtitle="Weight distribution of delivered goods by category (kg)"
            data={analytics?.categories || []}
            valueKey="total_weight_kg"
          />
        </div>

        {/* Volunteer Readiness & Profile Status Section */}
        {profileLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-72 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : profileError ? (
          <Alert variant="warning" title="Profile Check Unavailable">
            Unable to verify volunteer profile status at this moment.
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchProfile()}
              className="mt-2"
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
                  Complete your volunteer profile
                </CardTitle>
              </div>
              <CardDescription className="text-amber-700">
                Vehicle details, service radius, and home location are required before dispatch opportunities can be evaluated for you.
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <div className="flex items-center space-x-2.5">
                  <CardTitle className="text-base font-semibold text-zinc-900">
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
                <CardDescription className="flex items-center space-x-2 mt-0.5">
                  <span>{user?.email}</span>
                  <span>•</span>
                  <span>{profile.contact_phone}</span>
                </CardDescription>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant={profile.is_available ? "outline" : "primary"}
                  onClick={handleToggleAvailability}
                  isLoading={toggleAvailabilityMutation.isPending}
                  leftIcon={<Power className="h-3.5 w-3.5 mr-1" />}
                >
                  {profile.is_available ? "Go Off-Duty" : "Go Online"}
                </Button>
                <Link href="/app/volunteer/profile">
                  <Button size="sm" variant="outline" leftIcon={<Settings className="h-3.5 w-3.5 mr-1" />}>
                    Edit Profile
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Primary Transport
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <Truck className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <p className="text-xs font-semibold text-zinc-900">
                      {profile.vehicle_type.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Thermal Equipment
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <ThermometerSnowflake className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <p className="text-xs font-medium text-zinc-800">
                      {profile.has_insulated_bags ? "Insulated Bags Ready" : "Ambient Only"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Service Radius
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <Compass className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <p className="text-xs font-bold text-zinc-900">
                      {Number(profile.service_radius_km).toFixed(1)} km
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Home Departure Base
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <MapPin className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <p className="text-xs font-mono text-zinc-700">
                      {profile.home_location
                        ? `${profile.home_location.latitude.toFixed(3)}, ${profile.home_location.longitude.toFixed(3)}`
                        : "Not set"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Active Pickups Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CalendarCheck className="h-4 w-4 text-zinc-700" />
              <h3 className="text-sm font-semibold text-zinc-900">My Assigned Pickups</h3>
            </div>
            <Link href="/app/volunteer/pickups" className="text-xs font-medium text-sky-600 hover:text-sky-700">
              View All Pickups →
            </Link>
          </div>

          {pickupsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : pickupsError ? (
            <Alert variant="error" title="Unable to load pickups">
              Failed to retrieve your pickup assignments.
              <Button size="sm" variant="outline" onClick={() => refetchPickups()} className="mt-2">
                Retry
              </Button>
            </Alert>
          ) : !pickups || pickups.length === 0 ? (
            <EmptyState
              title="No pickup assignments"
              description="Available dispatch opportunities will appear when a compatible pickup is assigned to you or claimed."
            />
          ) : (
            <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white shadow-sm">
              {pickups.map((pickup) => (
                <div
                  key={pickup.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-50/70 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={pickup.status} />
                      <span className="text-xs font-mono font-semibold text-zinc-900">
                        Pickup #{pickup.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-zinc-400">•</span>
                      <span className="text-xs text-zinc-600">
                        Transport: {pickup.transport_mode.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Created: {new Date(pickup.created_at).toLocaleDateString()}
                      {pickup.scheduled_pickup_time && ` • Scheduled: ${new Date(pickup.scheduled_pickup_time).toLocaleString()}`}
                    </p>
                  </div>

                  <Link href={`/app/volunteer/pickups/${pickup.id}`}>
                    <Button size="sm" variant="outline">
                      Manage Delivery
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </AuthGuard>
  );
}
