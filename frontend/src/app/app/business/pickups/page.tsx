"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CalendarCheck,
  ChevronRight,
  Clock,
  Filter,
  Layers,
  MapPin,
  RefreshCw,
  RotateCcw,
  Truck,
  UserCheck,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { usePickups } from "@/hooks/use-pickups";
import { PickupStatus } from "@/types";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const PICKUP_STATUS_FILTERS: { label: string; value: PickupStatus | "ALL" }[] = [
  { label: "All Pickups", value: "ALL" },
  { label: "Scheduled / Assigned", value: "ASSIGNED" },
  { label: "In Transit", value: "IN_TRANSIT" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Failed / Cancelled", value: "FAILED" },
];

export default function BusinessPickupsPage() {
  const [selectedStatus, setSelectedStatus] = useState<PickupStatus | "ALL">("ALL");

  const statusQueryParam = selectedStatus === "ALL" ? undefined : selectedStatus;
  const {
    data: pickups,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = usePickups({
    status: statusQueryParam,
    limit: 50,
  });

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <PageHeader
          title="Scheduled Pickups"
          description="Track incoming vehicle arrivals and monitor food donation delivery statuses."
          actions={
            <div className="flex items-center space-x-2">
              <Link href="/app/business/donations">
                <Button size="sm" variant="outline" leftIcon={<Layers className="h-3.5 w-3.5 mr-1" />}>
                  Donations List
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                isLoading={isFetching}
                leftIcon={<RefreshCw className="h-3.5 w-3.5 mr-1" />}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3">
          {PICKUP_STATUS_FILTERS.map((filter) => {
            const isActive = selectedStatus === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => setSelectedStatus(filter.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* Pickups Content */}
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="error" title="Unable to load pickups">
            Failed to retrieve pickup records from the server.
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-3"
              leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
            >
              Try again
            </Button>
          </Alert>
        ) : !pickups || pickups.length === 0 ? (
          <EmptyState
            icon={<Truck className="h-8 w-8 text-zinc-400" />}
            title="No scheduled pickups found"
            description={
              selectedStatus === "ALL"
                ? "No active pickups have been scheduled for your donations yet. Matched non-profits will schedule transport once match offers are accepted."
                : `No pickup records found with status '${selectedStatus}'.`
            }
            action={{
              label: "View Donations",
              onClick: () => {
                window.location.href = "/app/business/donations";
              },
            }}
          />
        ) : (
          <div className="space-y-3 pt-2">
            {pickups.map((pickup) => (
              <Card
                key={pickup.id}
                className="hover:border-zinc-300 transition-colors bg-white shadow-sm"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={pickup.status} />
                        <span className="font-mono text-xs font-semibold text-zinc-900">
                          Pickup #{pickup.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-zinc-400">•</span>
                        <span className="text-xs text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded font-medium">
                          {pickup.transport_mode === "ORG_DIRECT"
                            ? "Recipient Direct Pickup"
                            : "Volunteer Courier Dispatch"}
                        </span>
                        {pickup.transport_mode === "VOLUNTEER" && (
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                              pickup.volunteer_id
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {pickup.volunteer_id ? "Courier Assigned" : "Dispatch Pending"}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-zinc-600">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Created: {new Date(pickup.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        {pickup.scheduled_pickup_time && (
                          <div className="flex items-center space-x-1.5">
                            <Calendar className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                            <span>
                              Scheduled: {new Date(pickup.scheduled_pickup_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </div>
                        )}
                      </div>

                      {pickup.notes && (
                        <p className="text-xs text-zinc-600 italic">
                          Notes: {pickup.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center sm:self-center">
                      <Link href={`/app/business/pickups/${pickup.id}`} className="w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          rightIcon={<ChevronRight className="h-4 w-4 ml-1" />}
                        >
                          View Logistics
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
