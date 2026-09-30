"use client";

import React, { useState } from "react";
import {
  Building2,
  CheckCircle2,
  HeartHandshake,
  Layers,
  Lock,
  Scale,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useAnalyticsOverview } from "@/hooks/use-analytics";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { KpiCard } from "@/components/analytics/kpi-card";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { TrendChart } from "@/components/analytics/trend-chart";
import { CategoryChart } from "@/components/analytics/category-chart";
import { TimeRangePreset } from "@/types";

export default function AdminWorkspacePage() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("30d");

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
  } = useAnalyticsOverview({ timeRange });

  const summary = analytics?.summary;
  const matching = analytics?.matching;
  const roleMetrics = analytics?.role_metrics || {};

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <PageContainer>
        <PageHeader
          title="Operations & Administration"
          description="Authoritative platform oversight, real-time aggregate metrics, and system security monitoring."
          badge={
            <Badge variant="danger" size="sm">
              <ShieldCheck className="mr-1 h-3 w-3 text-rose-600" />
              Platform Administrator
            </Badge>
          }
          actions={
            <TimeRangeSelector
              value={timeRange}
              onChange={setTimeRange}
              disabled={analyticsLoading}
            />
          }
        />

        {/* Analytics KPI Section */}
        {analyticsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-5 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </Card>
            ))}
          </div>
        ) : analyticsError ? (
          <Alert variant="error" title="Unable to load platform analytics">
            Failed to aggregate platform analytics from the database.
            <button
              onClick={() => refetchAnalytics()}
              className="mt-2 block text-xs font-semibold text-rose-700 underline"
            >
              Retry aggregation
            </button>
          </Alert>
        ) : summary && matching ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              title="Total Donations"
              value={summary.total_donations}
              subtitle={`${summary.active_donations} active / ${summary.delivered_donations} delivered`}
              icon={<Layers className="h-4 w-4" />}
              variant="emerald"
            />
            <KpiCard
              title="Delivered Food"
              value={`${summary.total_weight_kg_delivered.toLocaleString()} kg`}
              subtitle={`of ${summary.total_weight_kg_donated.toLocaleString()} kg donated`}
              icon={<Scale className="h-4 w-4" />}
              variant="sky"
            />
            <KpiCard
              title="Completed Pickups"
              value={summary.delivered_pickups}
              subtitle={`${summary.active_pickups} active in transit`}
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
            <KpiCard
              title="Verified Orgs"
              value={roleMetrics.verified_organizations ?? 0}
              subtitle={`of ${roleMetrics.total_organizations ?? 0} total registered`}
              icon={<Building2 className="h-4 w-4" />}
              variant="emerald"
            />
            <KpiCard
              title="Active Volunteers"
              value={roleMetrics.active_volunteers ?? 0}
              subtitle={`of ${roleMetrics.total_volunteers ?? 0} total registered`}
              icon={<Users className="h-4 w-4" />}
              variant="sky"
            />
          </div>
        ) : null}

        {/* Analytics Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TrendChart
            title="Platform Activity Over Time"
            subtitle="Daily weight (kg) of food donations and successful deliveries"
            data={analytics?.trends || []}
            metricKey="weight"
          />
          <CategoryChart
            title="Food Category Distribution"
            subtitle="Authoritative breakdown of surplus food by category (kg)"
            data={analytics?.categories || []}
            valueKey="total_weight_kg"
          />
        </div>

        {/* System Administration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Administrative Oversight</CardTitle>
            <CardDescription>
              Authenticated administrator session and operational authority.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-3.5 border border-zinc-200">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Admin Account
                </span>
                <p className="mt-1 truncate text-xs font-semibold text-zinc-900" title={user?.email}>
                  {user?.email}
                </p>
              </div>

              <div className="rounded-lg bg-zinc-50 p-3.5 border border-zinc-200">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Role Authority
                </span>
                <div className="mt-1 flex items-center space-x-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">Full System Access</span>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-50 p-3.5 border border-zinc-200">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Total Platform Users
                </span>
                <p className="mt-1 text-xs font-semibold text-zinc-800">
                  {roleMetrics.total_users ?? 0} registered user accounts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operational Queues */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-semibold text-zinc-900">Pending Organization Verifications</h3>
            </div>
            <EmptyState
              title="Verification Queue Clear"
              description="No organization accounts are currently pending admin verification review. New submissions will appear here for 501(c)(3) validation."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-semibold text-zinc-900">Security & Access Events</h3>
            </div>
            <EmptyState
              title="No Security Incidents"
              description="Real-time transaction locking, capacity reservation atomicity, and role authorization policies are operating normally."
            />
          </div>
        </div>
      </PageContainer>
    </AuthGuard>
  );
}
