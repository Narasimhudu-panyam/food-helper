"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronRight,
  Filter,
  Layers,
  Plus,
  RotateCcw,
  Thermometer,
} from "lucide-react";

import { AuthGuard } from "@/lib/auth/auth-guard";
import { useDonations } from "@/hooks/use-donations";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { DonationStatus } from "@/types";

const STATUS_FILTER_OPTIONS: Array<{ value: DonationStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All Donations" },
  { value: "CREATED", label: "Available" },
  { value: "MATCHED", label: "Matched" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "PICKUP_ASSIGNED", label: "Pickup Assigned" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function DonationsListPage() {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<DonationStatus | "ALL">("ALL");

  const {
    data: donations,
    isLoading,
    isError,
    refetch,
  } = useDonations({
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
  });

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <PageHeader
          title="Donations"
          description="Manage surplus food available for local non-profit matching."
          actions={
            <Link href="/app/business/donations/new">
              <Button size="sm" variant="primary" leftIcon={<Plus className="h-4 w-4 mr-1" />}>
                Create Donation
              </Button>
            </Link>
          }
        />

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3">
          <span className="mr-2 flex items-center text-xs font-semibold text-zinc-500">
            <Filter className="h-3.5 w-3.5 mr-1" />
            Filter Status:
          </span>
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const isActive = selectedStatus === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setSelectedStatus(opt.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : isError ? (
          <Alert variant="error" title="Unable to load donations">
            <p className="mt-1">
              Could not retrieve donation records from the server.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-3"
              leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
            >
              Try Again
            </Button>
          </Alert>
        ) : !donations || donations.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-6 w-6 text-zinc-400" />}
            title="No donations yet"
            description="Create your first surplus food donation to make it available for matching."
            action={{
              label: "Create Donation",
              onClick: () => {
                router.push("/app/business/donations/new");
              },
            }}
          />
        ) : (
          <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-xs">
            {donations.map((donation) => {
              const pickupDeadline = new Date(donation.pickup_deadline);
              const safeDeadline = new Date(donation.safe_consumption_deadline);

              return (
                <div
                  key={donation.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-50/70 transition-colors"
                >
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/business/donations/${donation.id}`}
                        className="text-sm font-semibold text-zinc-900 hover:text-emerald-600 transition-colors"
                      >
                        {donation.title}
                      </Link>
                      <StatusBadge status={donation.status} size="sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        {donation.quantity_value} {donation.quantity_unit} ({donation.total_weight_kg} kg)
                      </span>
                      <span>•</span>
                      <span>{donation.food_category.replace(/_/g, " ")}</span>
                      <span>•</span>
                      <span className="inline-flex items-center">
                        <Thermometer className="h-3 w-3 mr-0.5 text-zinc-400" />
                        {donation.storage_condition.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-zinc-400">
                      <span className="inline-flex items-center">
                        <Calendar className="h-3 w-3 mr-1 text-zinc-400" />
                        Pickup deadline: {pickupDeadline.toLocaleDateString()} {pickupDeadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>•</span>
                      <span>
                        Safe consumption: {safeDeadline.toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {donation.status === "CREATED" && (
                      <Link href={`/app/business/donations/${donation.id}/matches`}>
                        <Button size="sm" variant="primary">
                          Find Matches
                        </Button>
                      </Link>
                    )}
                    {donation.status === "MATCHED" && (
                      <Link href={`/app/business/donations/${donation.id}/offers`}>
                        <Button size="sm" variant="outline">
                          View Offers
                        </Button>
                      </Link>
                    )}
                    <Link href={`/app/business/donations/${donation.id}`}>
                      <Button size="sm" variant="ghost" rightIcon={<ChevronRight className="h-3.5 w-3.5" />}>
                        Details
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
