"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  HeartHandshake,
  Layers,
  MapPin,
  Phone,
  Plus,
  Scale,
  Settings,
  Truck,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useBusinessProfile } from "@/hooks/use-business-profile";
import { useDonations } from "@/hooks/use-donations";
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
import { KpiCard } from "@/components/analytics/kpi-card";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { TrendChart } from "@/components/analytics/trend-chart";
import { CategoryChart } from "@/components/analytics/category-chart";
import { TimeRangePreset } from "@/types";

export default function FoodBusinessOverviewPage() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("30d");

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useBusinessProfile();

  const {
    data: donations,
    isLoading: donationsLoading,
    isError: donationsError,
  } = useDonations({ limit: 5 });

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useAnalyticsOverview({ timeRange });

  const summary = analytics?.summary;
  const matching = analytics?.matching;

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <PageHeader
          title="Food Business"
          description="Manage surplus food donations and monitor your localized community food rescue impact."
          badge={
            <Badge variant="info" size="sm">
              <Building2 className="mr-1 h-3 w-3 text-sky-600" />
              Food Donor
            </Badge>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <TimeRangeSelector
                value={timeRange}
                onChange={setTimeRange}
                disabled={analyticsLoading}
              />
              <Link href="/app/business/donations/new">
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<Plus className="h-4 w-4 mr-1" />}
                >
                  Create Donation
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
        ) : summary && matching ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Donations Created"
              value={summary.total_donations}
              subtitle={`${summary.active_donations} active / ${summary.delivered_donations} delivered`}
              icon={<Layers className="h-4 w-4" />}
              variant="emerald"
            />
            <KpiCard
              title="Food Rescued"
              value={`${summary.total_weight_kg_delivered.toLocaleString()} kg`}
              subtitle={`of ${summary.total_weight_kg_donated.toLocaleString()} kg total donated`}
              icon={<Scale className="h-4 w-4" />}
              variant="sky"
            />
            <KpiCard
              title="Completed Pickups"
              value={summary.delivered_pickups}
              subtitle={`${summary.active_pickups} in transit`}
              icon={<Truck className="h-4 w-4" />}
              variant="indigo"
            />
            <KpiCard
              title="Match Acceptance"
              value={`${matching.acceptance_rate}%`}
              subtitle={`${matching.accepted_matches} accepted of ${matching.accepted_matches + matching.declined_matches} offers`}
              icon={<HeartHandshake className="h-4 w-4" />}
              variant="amber"
            />
          </div>
        ) : null}

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TrendChart
            title="Donation & Delivery Timeline"
            subtitle="Daily weight (kg) of surplus food donated vs delivered"
            data={analytics?.trends || []}
            metricKey="weight"
          />
          <CategoryChart
            title="Donation Categories"
            subtitle="Physical surplus food weight donated by category (kg)"
            data={analytics?.categories || []}
            valueKey="total_weight_kg"
          />
        </div>

        {/* Business Readiness / Profile Configuration Section */}
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
          <Alert
            variant="warning"
            title="Profile Check Unavailable"
          >
            Unable to verify profile configuration at this moment.
          </Alert>
        ) : !profile ? (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader>
              <div className="flex items-center space-x-2 text-amber-800">
                <AlertCircle className="h-4 w-4" />
                <CardTitle className="text-amber-900">
                  Complete your business profile
                </CardTitle>
              </div>
              <CardDescription className="text-amber-700">
                A registered physical address and geographic coordinates are required so the geospatial matching engine can discover nearby non-profit organizations for your donations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/app/business/profile">
                <Button size="sm" variant="primary">
                  Set Up Business Profile
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold text-zinc-900">
                  {profile.business_name}
                </CardTitle>
                <CardDescription className="flex items-center space-x-2 mt-0.5">
                  <span>{profile.business_type.replace(/_/g, " ")}</span>
                  <span>•</span>
                  <span>{user?.email}</span>
                </CardDescription>
              </div>
              <Link href="/app/business/profile">
                <Button size="sm" variant="outline" leftIcon={<Settings className="h-3.5 w-3.5 mr-1" />}>
                  Edit Profile
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Physical Address
                  </span>
                  <div className="mt-1 flex items-start space-x-1.5">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-700 leading-tight">
                      {profile.address_text}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Contact Phone
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <p className="text-xs font-medium text-zinc-700">
                      {profile.contact_phone}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Spatial Readiness
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700">
                      Coordinates Configured ({profile.location.latitude.toFixed(3)}, {profile.location.longitude.toFixed(3)})
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Donations Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-zinc-600" />
              <h2 className="text-sm font-bold text-zinc-900">Recent Donations</h2>
            </div>
            <Link
              href="/app/business/donations"
              className="inline-flex items-center text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              <span>View all donations</span>
              <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Link>
          </div>

          {donationsLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : donationsError ? (
            <Alert variant="error" title="Unable to load donations">
              Could not load recent donations from the server.
            </Alert>
          ) : !donations || donations.length === 0 ? (
            <EmptyState
              title="No active donations"
              description="Create a donation when surplus food is ready for pickup."
              action={{
                label: "Create Donation",
                onClick: () => {
                  window.location.href = "/app/business/donations/new";
                },
              }}
            />
          ) : (
            <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {donations.map((donation) => (
                <div
                  key={donation.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-50/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5">
                      <Link
                        href={`/app/business/donations/${donation.id}`}
                        className="text-xs font-bold text-zinc-900 hover:text-emerald-600"
                      >
                        {donation.title}
                      </Link>
                      <StatusBadge status={donation.status} size="sm" />
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {donation.quantity_value} {donation.quantity_unit} ({donation.total_weight_kg} kg) • {donation.food_category.replace(/_/g, " ")} • {donation.storage_condition.replace(/_/g, " ")}
                    </p>
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-zinc-500">
                    <span>
                      Pickup by {new Date(donation.pickup_deadline).toLocaleDateString()} {new Date(donation.pickup_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Link href={`/app/business/donations/${donation.id}`}>
                      <Button size="sm" variant="outline">
                        Details
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </AuthGuard>
  );
}
