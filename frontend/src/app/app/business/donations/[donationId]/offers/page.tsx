"use client";

import React, { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  HeartHandshake,
  MapPin,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useDonation } from "@/hooks/use-donations";
import { useDonationOffers } from "@/hooks/use-donation-matches";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function DonationOffersPage({
  params,
}: {
  params: Promise<{ donationId: string }>;
}) {
  const resolvedParams = use(params);
  const donationId = resolvedParams.donationId;

  const {
    data: donation,
    isLoading: donationLoading,
    isError: donationError,
  } = useDonation(donationId);

  const {
    data: offers,
    isLoading: offersLoading,
    isError: offersError,
    refetch,
    isFetching,
  } = useDonationOffers(donationId);

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href={`/app/business/donations/${donationId}`}
            className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Donation Details
          </Link>
        </div>

        <PageHeader
          title="Match Offers Sent"
          description={
            donation
              ? `Dispatched invitations for "${donation.title}" (${donation.total_weight_kg} kg)`
              : "Tracking dispatched match invitations..."
          }
          actions={
            <div className="flex items-center space-x-2">
              <Link href={`/app/business/donations/${donationId}/matches`}>
                <Button size="sm" variant="primary" leftIcon={<HeartHandshake className="h-3.5 w-3.5 mr-1" />}>
                  Find Candidates
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

        {offersLoading || donationLoading ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : offersError || donationError ? (
          <Alert variant="error" title="Unable to load match offers">
            Failed to retrieve match offers sent for this donation.
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
        ) : !offers || offers.length === 0 ? (
          <EmptyState
            title="No match offers sent yet"
            description="You have not sent any match offers to recipient organizations for this donation."
            action={{
              label: "Find Candidate Organizations",
              onClick: () => {},
              variant: "primary",
            }}
          />
        ) : (
          <div className="space-y-3 pt-2">
            {offers.map((offer) => (
              <Card key={offer.id} className="bg-white shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={offer.status} />
                        <span className="font-mono text-xs font-semibold text-zinc-900">
                          Offer #{offer.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-zinc-400">•</span>
                        <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Sparkles className="h-3 w-3 mr-1 text-emerald-600" />
                          Match Score: {Number(offer.score).toFixed(0)}/100
                        </span>
                        <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                          Rank #{offer.rank_order}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-zinc-600">
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Distance: <strong className="text-zinc-900">{(Number(offer.distance_meters) / 1000).toFixed(1)} km</strong>
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Invited: {new Date(offer.invited_at || offer.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                      </div>

                      {offer.responded_at && (
                        <p className="text-xs text-zinc-500">
                          Responded: {new Date(offer.responded_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      )}

                      {offer.rejection_reason && (
                        <div className="rounded bg-rose-50 p-2 text-xs text-rose-800 border border-rose-200">
                          <strong>Organization Decline Reason:</strong> {offer.rejection_reason}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center sm:self-center">
                      {offer.status === "ACCEPTED" ? (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200 flex items-center">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                          Capacity Reserved
                        </span>
                      ) : offer.status === "INVITED" ? (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200 flex items-center">
                          <Clock className="h-3.5 w-3.5 text-amber-600 mr-1" />
                          Awaiting Response
                        </span>
                      ) : null}
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
