"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  Edit2,
  KeyRound,
  Layers,
  MapPin,
  Package,
  RotateCcw,
  Send,
  Sparkles,
  Thermometer,
  Trash2,
} from "lucide-react";

import { AuthGuard } from "@/lib/auth/auth-guard";
import { useCancelDonation, useDonation } from "@/hooks/use-donations";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { LocationMap } from "@/components/maps/location-map";

const TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "EXPIRED", "FAILED_DELIVERY"];

export default function DonationDetailPage({
  params,
}: {
  params: Promise<{ donationId: string }>;
}) {
  const resolvedParams = use(params);
  const donationId = resolvedParams.donationId;

  const router = useRouter();
  const { success, error: toastError } = useToast();

  const { data: donation, isLoading, isError, refetch } = useDonation(donationId);
  const cancelMutation = useCancelDonation(donationId);

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isTerminal = donation ? TERMINAL_STATUSES.includes(donation.status) : false;

  const handleCancelDonation = async () => {
    if (!cancellationReason || cancellationReason.trim().length < 3) {
      setCancelError("Please provide a cancellation reason (minimum 3 characters).");
      return;
    }

    setCancelError(null);
    try {
      await cancelMutation.mutateAsync({
        cancellation_reason: cancellationReason.trim(),
      });
      success("Donation has been cancelled.", "Donation Cancelled");
      setIsCancelDialogOpen(false);
      refetch();
    } catch (err: any) {
      const msg = err?.detail || "Could not cancel donation. Please try again.";
      setCancelError(msg);
      toastError(msg, "Cancellation Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href="/app/business/donations"
            className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Donations
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : isError || !donation ? (
          <Alert variant="error" title="Donation Not Found">
            <p className="mt-1">
              Could not retrieve details for this donation record.
            </p>
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
        ) : (
          <>
            <PageHeader
              title={donation.title}
              description={`Donation ID: ${donation.id}`}
              badge={<StatusBadge status={donation.status} size="md" />}
              actions={
                !isTerminal && (
                  <div className="flex flex-wrap items-center gap-2">
                    {(donation.status === "CREATED" || donation.status === "DRAFT") && (
                      <Link href={`/app/business/donations/${donation.id}/matches`}>
                        <Button
                          size="sm"
                          variant="primary"
                          leftIcon={<Sparkles className="h-3.5 w-3.5 mr-1" />}
                        >
                          Find Matches
                        </Button>
                      </Link>
                    )}
                    <Link href={`/app/business/donations/${donation.id}/offers`}>
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<Send className="h-3.5 w-3.5 mr-1" />}
                      >
                        Match Offers
                      </Button>
                    </Link>
                    <Link href={`/app/business/donations/${donation.id}/edit`}>
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<Edit2 className="h-3.5 w-3.5 mr-1" />}
                      >
                        Edit
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="destructive"
                      leftIcon={<Trash2 className="h-3.5 w-3.5 mr-1" />}
                      onClick={() => {
                        setCancellationReason("");
                        setCancelError(null);
                        setIsCancelDialogOpen(true);
                      }}
                    >
                      Cancel Listing
                    </Button>
                  </div>
                )
              }
            />

            {/* Matched State Banner */}
            {donation.status === "MATCHED" && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-950">
                        Match Offer Sent & Pending
                      </h4>
                      <p className="text-xs text-blue-800">
                        A match offer has been dispatched to a non-profit partner and is currently awaiting their review.
                      </p>
                    </div>
                  </div>
                  <Link href={`/app/business/donations/${donation.id}/offers`}>
                    <Button size="sm" variant="primary" className="shrink-0 bg-blue-600 hover:bg-blue-700">
                      View Offers Tracking
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Handoff Verification PIN Card if active */}
            {donation.handoff_pin && (
              <Card className="border-emerald-200 bg-emerald-50/40">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                        Driver Pickup Handoff PIN
                      </h4>
                      <p className="text-xs text-emerald-800">
                        Provide this 4-digit verification code to the driver upon collection.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-2 border border-emerald-300 font-mono text-lg font-bold text-emerald-700 tracking-widest shadow-xs">
                    {donation.handoff_pin}
                  </div>
                </CardContent>
              </Card>
            )}

            {donation.cancellation_reason && (
              <Alert variant="warning" title="Donation Cancelled">
                Reason: {donation.cancellation_reason}
              </Alert>
            )}

            {/* Overview & Quantity Card */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Food & Quantity Specifications</CardTitle>
                  <CardDescription>Item classification and mass breakdown.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Category
                      </span>
                      <p className="mt-1 text-xs font-bold text-zinc-900">
                        {donation.food_category.replace(/_/g, " ")}
                      </p>
                    </div>

                    <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Total Quantity
                      </span>
                      <p className="mt-1 text-xs font-bold text-zinc-900">
                        {donation.quantity_value} {donation.quantity_unit}
                      </p>
                    </div>

                    <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Estimated Weight
                      </span>
                      <p className="mt-1 text-xs font-bold text-zinc-900">
                        {donation.total_weight_kg} kg
                      </p>
                    </div>

                    <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Packaging
                      </span>
                      <p className="mt-1 text-xs font-bold text-zinc-900">
                        {donation.packaging_type}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200 flex items-center space-x-2.5">
                    <Thermometer className="h-4 w-4 text-zinc-500" />
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
                        Storage Regime
                      </span>
                      <span className="text-xs font-semibold text-zinc-900">
                        {donation.storage_condition.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Time Windows & Deadlines Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Time Windows & Food Safety</CardTitle>
                  <CardDescription>Pickup deadlines and consumption schedule.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between border-b border-zinc-100 pb-2.5 text-xs">
                      <span className="text-zinc-500 flex items-center">
                        <Clock className="h-3.5 w-3.5 mr-1.5 text-zinc-400" />
                        Available From
                      </span>
                      <span className="font-semibold text-zinc-900">
                        {new Date(donation.available_from).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-start justify-between border-b border-zinc-100 pb-2.5 text-xs">
                      <span className="text-zinc-500 flex items-center">
                        <Calendar className="h-3.5 w-3.5 mr-1.5 text-zinc-400" />
                        Pickup Deadline
                      </span>
                      <span className="font-semibold text-amber-700">
                        {new Date(donation.pickup_deadline).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-start justify-between border-b border-zinc-100 pb-2.5 text-xs">
                      <span className="text-zinc-500 flex items-center">
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-zinc-400" />
                        Safe Consumption Deadline
                      </span>
                      <span className="font-semibold text-rose-700">
                        {new Date(donation.safe_consumption_deadline).toLocaleString()}
                      </span>
                    </div>

                    {donation.preparation_time && (
                      <div className="flex items-start justify-between text-xs pt-0.5">
                        <span className="text-zinc-500">Prepared / Cooked</span>
                        <span className="text-zinc-700">
                          {new Date(donation.preparation_time).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Location & Instructions Card */}
            <Card>
              <CardHeader>
                <CardTitle>Pickup Instructions & Location</CardTitle>
                <CardDescription>
                  Geographic coordinates registered with the spatial matching engine.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200 flex items-start space-x-3">
                  <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
                      Pickup Coordinates
                    </span>
                    <p className="text-xs font-mono font-medium text-zinc-800 mt-0.5">
                      Latitude: {donation.location.latitude.toFixed(4)}, Longitude: {donation.location.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>

                {/* Pickup Location Map Preview */}
                <div className="pt-2 border-t border-zinc-100">
                  <LocationMap
                    title="Pickup Location Map"
                    center={{
                      latitude: donation.location.latitude,
                      longitude: donation.location.longitude,
                    }}
                    markers={[
                      {
                        position: donation.location,
                        title: donation.title,
                        description: `Pickup point for donation #${donation.id.slice(0, 8)}`,
                        variant: "donation",
                      },
                    ]}
                    height="240px"
                  />
                </div>

                {donation.pickup_notes && (
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
                      Specific Instructions for Drivers
                    </span>
                    <p className="mt-1 text-xs text-zinc-700 leading-relaxed">
                      {donation.pickup_notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Cancel Confirmation Dialog */}
        <Dialog
          isOpen={isCancelDialogOpen}
          onClose={() => setIsCancelDialogOpen(false)}
          title="Cancel Donation Listing"
          description="Once cancelled, this surplus food donation will immediately be withdrawn from matching."
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            {cancelError && (
              <Alert variant="error" title="Cancellation Error">
                {cancelError}
              </Alert>
            )}

            <Textarea
              label="Cancellation Reason (Required)"
              placeholder="e.g. Surplus food was repurposed or expired before match acceptance."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={3}
            />

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setIsCancelDialogOpen(false)}
                disabled={cancelMutation.isPending}
              >
                Keep Listing
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="md"
                isLoading={cancelMutation.isPending}
                onClick={handleCancelDonation}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Dialog>
      </PageContainer>
    </AuthGuard>
  );
}
