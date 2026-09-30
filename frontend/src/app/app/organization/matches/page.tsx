"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  HeartHandshake,
  MapPin,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useOrganizationMatches } from "@/hooks/use-organization-matches";
import { MatchStatus } from "@/types";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_FILTERS: { label: string; value: MatchStatus | "ALL" }[] = [
  { label: "All Offers", value: "ALL" },
  { label: "Invited (Action Required)", value: "INVITED" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Declined", value: "DECLINED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Revoked", value: "REVOKED" },
];

export default function OrganizationMatchesPage() {
  const [selectedStatus, setSelectedStatus] = useState<MatchStatus | "ALL">("ALL");

  const statusQueryParam = selectedStatus === "ALL" ? undefined : selectedStatus;
  const {
    data: matches,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useOrganizationMatches({
    status: statusQueryParam,
    limit: 50,
  });

  return (
    <AuthGuard allowedRoles={["ORGANIZATION"]}>
      <PageContainer>
        <PageHeader
          title="Incoming Matches"
          description="Review surplus food donation invitations dispatched to your organization."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              isLoading={isFetching}
              leftIcon={<RefreshCw className="h-3.5 w-3.5 mr-1" />}
            >
              Refresh Offers
            </Button>
          }
        />

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3">
          {STATUS_FILTERS.map((filter) => {
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

        {/* Matches Feed / Content */}
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="error" title="Unable to load donation offers">
            Failed to retrieve match offers from the matching engine.
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
        ) : !matches || matches.length === 0 ? (
          <EmptyState
            title="No donation offers"
            description={
              selectedStatus === "ALL"
                ? "Matching opportunities will appear here when eligible surplus food is available."
                : `No match offers found with status '${selectedStatus}'.`
            }
            action={{
              label: "Refresh",
              onClick: () => refetch(),
              variant: "outline",
            }}
          />
        ) : (
          <div className="space-y-3 pt-2">
            {matches.map((match) => (
              <Card
                key={match.id}
                className="hover:border-zinc-300 transition-colors bg-white shadow-sm"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={match.status} />
                        <span className="font-mono text-xs font-semibold text-zinc-900">
                          Offer #{match.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-zinc-400">•</span>
                        <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Sparkles className="h-3 w-3 mr-1 text-emerald-600" />
                          Match Score: {Number(match.score).toFixed(0)}/100
                        </span>
                        <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                          Rank #{match.rank_order}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-zinc-600">
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Distance: <strong className="text-zinc-900">{(Number(match.distance_meters) / 1000).toFixed(1)} km</strong> from facility
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Invited: {new Date(match.invited_at || match.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                      </div>

                      {match.rejection_reason && (
                        <div className="rounded bg-rose-50 p-2 text-xs text-rose-800 border border-rose-200">
                          <strong>Decline Reason:</strong> {match.rejection_reason}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center sm:self-center">
                      <Link href={`/app/organization/matches/${match.id}`} className="w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant={match.status === "INVITED" ? "primary" : "outline"}
                          className="w-full sm:w-auto"
                          rightIcon={<ChevronRight className="h-4 w-4 ml-1" />}
                        >
                          {match.status === "INVITED" ? "Review & Respond" : "View Details"}
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
