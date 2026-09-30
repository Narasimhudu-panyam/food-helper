"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  HeartHandshake,
  Layers,
  MapPin,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useDonation } from "@/hooks/use-donations";
import {
  useCreateMatchOffer,
  useDonationMatchingCandidates,
} from "@/hooks/use-donation-matches";
import { CandidateMatchResponse } from "@/types";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export default function DonationMatchesDiscoveryPage({
  params,
}: {
  params: Promise<{ donationId: string }>;
}) {
  const resolvedParams = use(params);
  const donationId = resolvedParams.donationId;
  const router = useRouter();

  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(25.0);
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateMatchResponse | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: donation,
    isLoading: donationLoading,
    isError: donationError,
  } = useDonation(donationId);

  const {
    data: matchData,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch,
    isFetching,
  } = useDonationMatchingCandidates(donationId, maxRadiusKm);

  const createOfferMutation = useCreateMatchOffer();
  const { success, error: toastError } = useToast();

  const handleOpenConfirmDialog = (candidate: CandidateMatchResponse) => {
    setSelectedCandidate(candidate);
    setActionError(null);
    setIsConfirmDialogOpen(true);
  };

  const handleSendOffer = async () => {
    if (!selectedCandidate) return;
    setActionError(null);
    try {
      await createOfferMutation.mutateAsync({
        donationId,
        data: { organization_id: selectedCandidate.organization_id },
      });
      setIsConfirmDialogOpen(false);
      success(
        `Match offer successfully sent to ${selectedCandidate.org_name}.`,
        "Offer Sent"
      );
      router.push(`/app/business/donations/${donationId}/offers`);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Failed to send match offer. An active offer may already exist for this organization or the donation status changed.";
      setActionError(msg);
      toastError(msg, "Offer Failed");
    }
  };

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
          title="Match Discovery"
          description={
            donation
              ? `Geospatially discovered recipient organizations for "${donation.title}" (${donation.total_weight_kg} kg ${donation.food_category.replace(/_/g, " ")})`
              : "Discovering verified recipient organizations..."
          }
          actions={
            <div className="flex items-center space-x-2">
              <select
                value={maxRadiusKm}
                onChange={(e) => setMaxRadiusKm(Number(e.target.value))}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 shadow-xs focus:border-sky-500 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
              >
                <option value={10}>Search Radius: 10 km</option>
                <option value={25}>Search Radius: 25 km</option>
                <option value={50}>Search Radius: 50 km</option>
                <option value={100}>Search Radius: 100 km</option>
              </select>

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

        {matchesLoading || donationLoading ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : matchesError || donationError ? (
          <Alert variant="error" title="Unable to find matching organizations">
            Failed to run geospatial matching engine for this donation.
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
        ) : !matchData || matchData.matches.length === 0 ? (
          <EmptyState
            title="No eligible organizations found"
            description="No verified organization currently satisfies the donation's matching requirements within the selected radius."
            action={{
              label: "Expand Radius or Refresh",
              onClick: () => {
                if (maxRadiusKm < 50) setMaxRadiusKm(50);
                refetch();
              },
              variant: "outline",
            }}
          />
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-zinc-500 pb-1">
              <span>
                Found <strong>{matchData.total_candidates_found}</strong> eligible recipient organizations ranked by spatial proximity & capacity
              </span>
              <Link
                href={`/app/business/donations/${donationId}/offers`}
                className="font-medium text-sky-600 hover:text-sky-700"
              >
                View Sent Offers →
              </Link>
            </div>

            {matchData.matches.map((candidate: CandidateMatchResponse) => (
              <Card
                key={candidate.organization_id}
                className="hover:border-zinc-300 transition-colors bg-white shadow-sm"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900">
                          {candidate.org_name}
                        </span>
                        <Badge variant="default" size="sm">
                          {candidate.org_type.replace(/_/g, " ")}
                        </Badge>
                        <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Sparkles className="h-3 w-3 mr-1 text-emerald-600" />
                          Match Score: {candidate.score.toFixed(0)}/100
                        </span>
                        <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                          Priority Rank #{candidate.rank}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-zinc-600">
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Distance: <strong className="text-zinc-900">{candidate.distance_km.toFixed(1)} km</strong> from kitchen
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <Layers className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Available Storage: <strong className="text-emerald-700">{candidate.available_capacity_kg.toFixed(0)} kg</strong> (Max: {candidate.max_capacity_kg.toFixed(0)} kg)
                          </span>
                        </div>
                      </div>

                      {candidate.match_reasons && candidate.match_reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {candidate.match_reasons.map((reason: string, idx: number) => (
                            <span
                              key={idx}
                              className="text-[11px] bg-zinc-50 text-zinc-600 border border-zinc-200 px-2 py-0.5 rounded"
                            >
                              {reason.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center sm:self-center">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenConfirmDialog(candidate)}
                        leftIcon={<Send className="h-3.5 w-3.5 mr-1" />}
                      >
                        Send Match Offer
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Send Offer Confirmation Dialog */}
        <Dialog
          isOpen={isConfirmDialogOpen}
          onClose={() => setIsConfirmDialogOpen(false)}
          title="Send Donation Match Offer?"
          description={`An official invitation will be sent to ${selectedCandidate?.org_name}. When accepted, storage capacity will be atomically reserved.`}
        >
          {actionError && (
            <div className="mb-3">
              <Alert variant="error" title="Could Not Send Offer">
                {actionError}
              </Alert>
            </div>
          )}

          {selectedCandidate && (
            <div className="space-y-3 rounded-lg bg-zinc-50 p-4 border border-zinc-200 text-xs text-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-500">Recipient Organization:</span>
                <strong className="text-zinc-900">{selectedCandidate.org_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Geospatial Distance:</span>
                <span className="font-semibold text-zinc-900">{selectedCandidate.distance_km.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Match Compatibility Score:</span>
                <span className="font-semibold text-emerald-700">{selectedCandidate.score.toFixed(1)}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Recipient Available Storage:</span>
                <span className="font-semibold text-zinc-900">{selectedCandidate.available_capacity_kg.toFixed(0)} kg</span>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmDialogOpen(false)}
              disabled={createOfferMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendOffer}
              isLoading={createOfferMutation.isPending}
              leftIcon={<Send className="h-3.5 w-3.5 mr-1" />}
            >
              Send Offer
            </Button>
          </div>
        </Dialog>
      </PageContainer>
    </AuthGuard>
  );
}
