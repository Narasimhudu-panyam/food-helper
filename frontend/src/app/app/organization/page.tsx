"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Layers,
  MapPin,
  Phone,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useOrganizationProfile } from "@/hooks/use-organization-profile";
import { useOrganizationMatches } from "@/hooks/use-organization-matches";
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
import { OrgVerificationStatus, TimeRangePreset } from "@/types";

function VerificationBadge({ status }: { status: OrgVerificationStatus }) {
  switch (status) {
    case "VERIFIED":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span>Verified Partner</span>
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          <span>Verification Pending</span>
        </span>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
          <XCircle className="h-3.5 w-3.5 text-rose-600" />
          <span>Verification Rejected</span>
        </span>
      );
    case "SUSPENDED":
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
          <span>Account Suspended</span>
        </span>
      );
    default:
      return null;
  }
}

export default function OrganizationWorkspacePage() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("30d");

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useOrganizationProfile();

  const {
    data: matches,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
  } = useOrganizationMatches({ limit: 5 });

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useAnalyticsOverview({ timeRange });

  const summary = analytics?.summary;
  const matching = analytics?.matching;
  const roleMetrics = analytics?.role_metrics || {};

  const maxCap = profile ? Number(profile.max_capacity_kg) : 0;
  const currentCap = profile ? Number(profile.current_capacity_kg) : 0;
  const availableCap = Math.max(0, maxCap - currentCap);
  const usagePercent = maxCap > 0 ? Math.min(100, Math.round((currentCap / maxCap) * 100)) : 0;

  return (
    <AuthGuard allowedRoles={["ORGANIZATION"]}>
      <PageContainer>
        <PageHeader
          title="Organization"
          description="Manage your receiving capacity, respond to surplus food donations, and track community intake."
          badge={
            <Badge variant="success" size="sm">
              <ShieldCheck className="mr-1 h-3 w-3 text-emerald-600" />
              Recipient Organization
            </Badge>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <TimeRangeSelector
                value={timeRange}
                onChange={setTimeRange}
                disabled={analyticsLoading}
              />
              <Link href="/app/organization/matches">
                <Button size="sm" variant="outline" leftIcon={<HeartHandshake className="h-4 w-4 mr-1" />}>
                  View Matches
                </Button>
              </Link>
              <Link href="/app/organization/capacity">
                <Button size="sm" variant="primary" leftIcon={<Layers className="h-4 w-4 mr-1" />}>
                  Manage Capacity
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
              title="Received Pickups"
              value={summary.delivered_pickups}
              subtitle={`${summary.active_pickups} active in transit`}
              icon={<Truck className="h-4 w-4" />}
              variant="emerald"
            />
            <KpiCard
              title="Food Received"
              value={`${summary.total_weight_kg_delivered.toLocaleString()} kg`}
              subtitle="delivered to facility storage"
              icon={<Scale className="h-4 w-4" />}
              variant="sky"
            />
            <KpiCard
              title="Match Acceptance"
              value={`${matching.acceptance_rate}%`}
              subtitle={`${matching.accepted_matches} accepted of ${matching.total_matches} invited`}
              icon={<HeartHandshake className="h-4 w-4" />}
              variant="amber"
            />
            <KpiCard
              title="Storage Occupied"
              value={`${roleMetrics.current_capacity_kg ?? currentCap} / ${roleMetrics.max_capacity_kg ?? maxCap} kg`}
              subtitle={`${roleMetrics.capacity_utilization_pct ?? usagePercent}% of max capacity`}
              icon={<Layers className="h-4 w-4" />}
              variant="indigo"
            />
          </div>
        ) : null}

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TrendChart
            title="Intake Activity Timeline"
            subtitle="Daily weight (kg) of surplus food received into inventory"
            data={analytics?.trends || []}
            metricKey="weight"
          />
          <CategoryChart
            title="Received Categories"
            subtitle="Food categories received by storage weight (kg)"
            data={analytics?.categories || []}
            valueKey="total_weight_kg"
          />
        </div>

        {/* Profile Readiness & Status Section */}
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
            Unable to verify organization profile status at this moment.
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
                  Complete your organization profile
                </CardTitle>
              </div>
              <CardDescription className="text-amber-700">
                Organization details, physical location coordinates, intake capacity limits, and accepted food categories are required to receive donation match offers.
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <div className="flex items-center space-x-2.5">
                  <CardTitle className="text-base font-semibold text-zinc-900">
                    {profile.org_name}
                  </CardTitle>
                  <VerificationBadge status={profile.verification_status} />
                </div>
                <CardDescription className="flex items-center space-x-2 mt-0.5">
                  <span>{profile.org_type.replace(/_/g, " ")}</span>
                  <span>•</span>
                  <span>{user?.email}</span>
                  {profile.tax_id && (
                    <>
                      <span>•</span>
                      <span>Tax ID: {profile.tax_id}</span>
                    </>
                  )}
                </CardDescription>
              </div>
              <Link href="/app/organization/profile">
                <Button size="sm" variant="outline" leftIcon={<Settings className="h-3.5 w-3.5 mr-1" />}>
                  Edit Profile
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Physical Facility Location
                  </span>
                  <div className="mt-1 flex items-start space-x-1.5">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-700 leading-tight">
                        {profile.address_text}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                        {profile.location.latitude.toFixed(4)}, {profile.location.longitude.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Operations Phone
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
                    Direct Transport
                  </span>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <Truck className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <p className="text-xs font-medium text-zinc-700">
                      {profile.can_pickup ? "Staff / Vehicle Pickup Capable" : "Volunteer Courier Dependent"}
                    </p>
                  </div>
                </div>
              </div>

              {profile.accepted_categories && profile.accepted_categories.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Accepted Food Categories
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {profile.accepted_categories.map((category) => (
                      <Badge key={category} variant="default" size="sm">
                        {category.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Capacity Summary Section */}
        {profile && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-semibold text-zinc-900">
                  Storage & Intake Capacity
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time storage allocation managed atomically by backend reservation.
                </CardDescription>
              </div>
              <Link href="/app/organization/capacity">
                <Button size="sm" variant="outline">
                  Update Limits
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                  <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Available Intake Space
                  </span>
                  <p className="mt-1 text-xl font-bold text-emerald-700">
                    {availableCap.toFixed(1)} <span className="text-xs font-normal text-zinc-500">kg</span>
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                  <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Current Occupied / Reserved
                  </span>
                  <p className="mt-1 text-xl font-bold text-zinc-900">
                    {currentCap.toFixed(1)} <span className="text-xs font-normal text-zinc-500">kg</span>
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                  <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Maximum Capacity
                  </span>
                  <p className="mt-1 text-xl font-bold text-zinc-900">
                    {maxCap.toFixed(1)} <span className="text-xs font-normal text-zinc-500">kg</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Capacity Utilization</span>
                  <span className="font-semibold text-zinc-700">{usagePercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden border border-zinc-200">
                  <div
                    className={`h-full transition-all duration-300 ${
                      usagePercent > 90
                        ? "bg-rose-500"
                        : usagePercent > 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Incoming Matches Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <HeartHandshake className="h-4 w-4 text-zinc-700" />
              <h3 className="text-sm font-semibold text-zinc-900">Recent Match Invitations</h3>
            </div>
            <Link href="/app/organization/matches" className="text-xs font-medium text-sky-600 hover:text-sky-700">
              View All Matches →
            </Link>
          </div>

          {matchesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : matchesError ? (
            <Alert variant="error" title="Unable to load match offers">
              Failed to retrieve recent donation match offers.
              <Button size="sm" variant="outline" onClick={() => refetchMatches()} className="mt-2">
                Retry
              </Button>
            </Alert>
          ) : !matches || matches.length === 0 ? (
            <EmptyState
              title="No incoming donation offers"
              description="Eligible donations will appear here when a food business creates a matching opportunity."
            />
          ) : (
            <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-50/70 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={match.status} />
                      <span className="text-xs font-mono text-zinc-500">
                        Match #{match.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-zinc-400">•</span>
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Score: {Number(match.score).toFixed(0)}/100
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600">
                      Distance: <span className="font-semibold text-zinc-800">{(Number(match.distance_meters) / 1000).toFixed(1)} km</span>
                      {" • "}
                      Rank #{match.rank_order}
                      {" • "}
                      Invited: {new Date(match.invited_at || match.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <Link href={`/app/organization/matches/${match.id}`}>
                    <Button size="sm" variant="outline">
                      Review Match Offer
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
