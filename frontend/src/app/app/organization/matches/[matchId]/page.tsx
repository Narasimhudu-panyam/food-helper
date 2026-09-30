"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Layers,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Truck,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useAcceptMatch,
  useDeclineMatch,
  useMatch,
} from "@/hooks/use-organization-matches";
import { useOrganizationProfile } from "@/hooks/use-organization-profile";
import { useCreatePickupForMatch } from "@/hooks/use-pickups";
import {
  MatchAcceptFormData,
  MatchDeclineFormData,
  matchAcceptSchema,
  matchDeclineSchema,
} from "@/lib/validation/match-action";
import {
  PickupCreateFormData,
  pickupCreateSchema,
} from "@/lib/validation/pickup-action";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { TransportMode } from "@/types";
import { useDonation } from "@/hooks/use-donations";
import { LocationMap } from "@/components/maps/location-map";

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const matchId = params.matchId;

  const { data: match, isLoading, isError, refetch } = useMatch(matchId);
  const { data: profile } = useOrganizationProfile();
  const { data: donation } = useDonation(match?.donation_id);

  const acceptMutation = useAcceptMatch();
  const declineMutation = useDeclineMatch();
  const createPickupMutation = useCreatePickupForMatch();
  const { success, error: toastError } = useToast();

  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [isCreatePickupModalOpen, setIsCreatePickupModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Accept Form
  const {
    register: registerAccept,
    handleSubmit: handleSubmitAccept,
    watch: watchAccept,
    formState: { isSubmitting: isSubmittingAccept },
  } = useForm<MatchAcceptFormData>({
    resolver: zodResolver(matchAcceptSchema),
    defaultValues: {
      transport_mode: profile?.can_pickup ? "ORG_DIRECT" : "VOLUNTEER",
    },
  });

  const selectedTransportMode = watchAccept("transport_mode");

  // Create Pickup Form
  const {
    register: registerPickup,
    handleSubmit: handleSubmitPickup,
    watch: watchPickup,
    reset: resetPickup,
    formState: { errors: errorsPickup, isSubmitting: isSubmittingPickup },
  } = useForm<PickupCreateFormData>({
    resolver: zodResolver(pickupCreateSchema),
    defaultValues: {
      transport_mode: "ORG_DIRECT",
      scheduled_pickup_time: "",
      notes: "",
    },
  });

  const selectedPickupTransportMode = watchPickup("transport_mode");

  // Decline Form
  const {
    register: registerDecline,
    handleSubmit: handleSubmitDecline,
    reset: resetDecline,
    formState: { errors: errorsDecline, isSubmitting: isSubmittingDecline },
  } = useForm<MatchDeclineFormData>({
    resolver: zodResolver(matchDeclineSchema),
    defaultValues: {
      rejection_reason: "",
    },
  });

  const onAcceptSubmit = async (data: MatchAcceptFormData) => {
    setActionError(null);
    try {
      await acceptMutation.mutateAsync({
        matchId,
        data: { transport_mode: data.transport_mode as TransportMode },
      });
      setIsAcceptModalOpen(false);
      success("Match offer accepted and storage capacity reserved successfully.", "Match Accepted");
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Failed to accept match. Another organization may have claimed it, or capacity limits were reached.";
      setActionError(msg);
      toastError(msg, "Acceptance Failed");
    }
  };

  const onCreatePickupSubmit = async (data: PickupCreateFormData) => {
    setActionError(null);
    try {
      const formattedTime = data.scheduled_pickup_time
        ? new Date(data.scheduled_pickup_time).toISOString()
        : null;

      const newPickup = await createPickupMutation.mutateAsync({
        matchId,
        data: {
          scheduled_pickup_time: formattedTime,
          transport_mode: data.transport_mode as TransportMode,
          notes: data.notes || null,
        },
      });
      setIsCreatePickupModalOpen(false);
      resetPickup();
      success("Pickup coordination task created successfully.", "Pickup Scheduled");
      router.push(`/app/organization/pickups/${newPickup.id}`);
    } catch (err: any) {
      const msg =
        err?.detail ||
        "Could not create pickup task. An active pickup may already exist.";
      setActionError(msg);
      toastError(msg, "Pickup Creation Failed");
    }
  };

  const onDeclineSubmit = async (data: MatchDeclineFormData) => {
    setActionError(null);
    try {
      await declineMutation.mutateAsync({
        matchId,
        data: { rejection_reason: data.rejection_reason },
      });
      setIsDeclineModalOpen(false);
      resetDecline();
      success("Match offer has been declined.", "Offer Declined");
    } catch (err: any) {
      const msg =
        err?.detail || "Failed to decline match offer. Please try again.";
      setActionError(msg);
      toastError(msg, "Action Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["ORGANIZATION"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href="/app/organization/matches"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Match Offers
          </Link>
        </div>

        <PageHeader
          title="Match Offer Review"
          description={`Comprehensive review for match invitation #${matchId.slice(0, 8)}`}
          actions={
            match && (
              <div className="flex items-center space-x-2">
                {match.status === "INVITED" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActionError(null);
                        setIsDeclineModalOpen(true);
                      }}
                    >
                      Decline Offer
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setActionError(null);
                        setIsAcceptModalOpen(true);
                      }}
                    >
                      Accept Offer
                    </Button>
                  </>
                )}

                {match.status === "ACCEPTED" && (
                  <>
                    <Link href="/app/organization/pickups">
                      <Button size="sm" variant="outline">
                        View Pickups
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setActionError(null);
                        setIsCreatePickupModalOpen(true);
                      }}
                      leftIcon={<Truck className="h-3.5 w-3.5 mr-1" />}
                    >
                      Schedule Pickup
                    </Button>
                  </>
                )}
              </div>
            )
          }
        />

        {isLoading ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72 mt-1" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : isError ? (
          <Alert variant="error" title="Unable to load match offer">
            Failed to fetch match details. The offer may not exist or you do not have permission to view it.
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
        ) : !match ? (
          <Alert variant="warning" title="Match Offer Not Found">
            The requested match offer could not be located.
          </Alert>
        ) : (
          <div className="space-y-6">
            {actionError && (
              <Alert
                variant="error"
                title="Action Error"
                onDismiss={() => setActionError(null)}
              >
                {actionError}
              </Alert>
            )}

            {/* Match Status Banner */}
            {match.status === "ACCEPTED" && (
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                        Match Accepted & Capacity Reserved
                      </h4>
                      <p className="text-xs text-emerald-800">
                        Storage capacity has been reserved. You can now schedule transport logistics for this donation.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        setActionError(null);
                        setIsCreatePickupModalOpen(true);
                      }}
                      leftIcon={<Truck className="h-3.5 w-3.5 mr-1" />}
                    >
                      Create Pickup Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {match.status === "DECLINED" && (
              <Alert variant="info" title="Match Declined">
                This match invitation was declined. Rejection reason: <em>"{match.rejection_reason}"</em>
              </Alert>
            )}

            {match.status === "EXPIRED" && (
              <Alert variant="warning" title="Match Offer Expired">
                The response window for this match offer has expired.
              </Alert>
            )}

            {match.status === "REVOKED" && (
              <Alert variant="error" title="Match Revoked">
                This match offer was revoked by the donor or system.
              </Alert>
            )}

            {/* Match Offer Overview Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center space-x-2.5">
                      <CardTitle className="text-lg font-bold text-zinc-900">
                        Match Offer #{match.id.slice(0, 8)}
                      </CardTitle>
                      <StatusBadge status={match.status} />
                    </div>
                    <CardDescription className="mt-1">
                      Donation Reference ID: <span className="font-mono">{match.donation_id}</span>
                    </CardDescription>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                      Composite Score: {Number(match.score).toFixed(1)}/100
                    </span>
                    <span className="text-xs font-medium text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
                      Priority Rank #{match.rank_order}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Geodesic Distance
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-sm font-bold text-zinc-900">
                        {(Number(match.distance_meters) / 1000).toFixed(1)} km
                      </p>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Precise distance from your intake facility.
                    </p>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Offer Timestamps
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-semibold text-zinc-900">
                        Invited: {new Date(match.invited_at || match.created_at).toLocaleString()}
                      </p>
                    </div>
                    {match.responded_at && (
                      <p className="text-[11px] text-zinc-600 mt-1">
                        Responded: {new Date(match.responded_at).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Your Available Capacity
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-sm font-bold text-emerald-700">
                        {profile
                          ? `${(Number(profile.max_capacity_kg) - Number(profile.current_capacity_kg)).toFixed(1)} kg available`
                          : "Checking..."}
                      </p>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Verified before capacity locking.
                    </p>
                  </div>
                </div>

                {/* Pickup Location Map Preview */}
                {donation && (
                  <div className="pt-2 border-t border-zinc-100">
                    <LocationMap
                      title="Donor Collection Site (Pickup Location)"
                      center={donation.location}
                      markers={[
                        {
                          position: donation.location,
                          title: donation.title,
                          description: `Pickup point — ${(Number(match.distance_meters) / 1000).toFixed(1)} km from your facility`,
                          variant: "donation",
                        },
                      ]}
                      height="240px"
                    />
                  </div>
                )}

                {match.rejection_reason && (
                  <div className="rounded-lg bg-rose-50 p-4 border border-rose-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                      Rejection / Decline Feedback
                    </span>
                    <p className="mt-1 text-xs text-rose-900">
                      {match.rejection_reason}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Box for Invited Match */}
            {match.status === "INVITED" && (
              <Card className="border-sky-200 bg-sky-50/30">
                <CardHeader>
                  <CardTitle className="text-base text-sky-950">
                    Respond to Donation Offer
                  </CardTitle>
                  <CardDescription className="text-sky-800">
                    Accepting will immediately reserve space in your facility and transition the donation to matched status.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        setActionError(null);
                        setIsAcceptModalOpen(true);
                      }}
                      leftIcon={<CheckCircle2 className="h-4 w-4 mr-1" />}
                    >
                      Accept Match Offer
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setActionError(null);
                        setIsDeclineModalOpen(true);
                      }}
                      leftIcon={<XCircle className="h-4 w-4 mr-1" />}
                    >
                      Decline Match Offer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Accept Modal Dialog */}
        <Dialog
          isOpen={isAcceptModalOpen}
          onClose={() => setIsAcceptModalOpen(false)}
          title="Accept Donation Match Offer"
          description="Choose your designated transport mode to complete match acceptance and capacity reservation."
        >
          <form onSubmit={handleSubmitAccept(onAcceptSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                Designated Transport Mode
              </label>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTransportMode === "ORG_DIRECT"
                      ? "bg-sky-50 border-sky-300 ring-1 ring-sky-300"
                      : "bg-white border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    value="ORG_DIRECT"
                    className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    {...registerAccept("transport_mode")}
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 flex items-center">
                      <Truck className="h-3.5 w-3.5 mr-1 text-zinc-600" />
                      Direct Organization Pickup (Self-Transport)
                    </span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Your staff or volunteer vehicles will drive directly to the donor establishment.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTransportMode === "VOLUNTEER"
                      ? "bg-sky-50 border-sky-300 ring-1 ring-sky-300"
                      : "bg-white border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    value="VOLUNTEER"
                    className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    {...registerAccept("transport_mode")}
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 flex items-center">
                      <UserCheck className="h-3.5 w-3.5 mr-1 text-zinc-600" />
                      Request Volunteer Courier Dispatch
                    </span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Request an available community volunteer to courier the food from the donor to your intake facility.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Atomic Capacity Lock:</strong> Submitting will lock the database row and atomically increase your current occupied capacity.
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAcceptModalOpen(false)}
                disabled={isSubmittingAccept}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSubmittingAccept}
              >
                Confirm & Accept
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Decline Modal Dialog */}
        <Dialog
          isOpen={isDeclineModalOpen}
          onClose={() => setIsDeclineModalOpen(false)}
          title="Decline Donation Offer"
          description="Please state a brief reason why your organization cannot accept this offer."
        >
          <form onSubmit={handleSubmitDecline(onDeclineSubmit)} className="space-y-4">
            <Textarea
              label="Rejection / Decline Reason"
              placeholder="e.g. Storage units currently full, lack of refrigeration space, or dietary restriction mismatch."
              error={errorsDecline.rejection_reason?.message}
              disabled={isSubmittingDecline}
              rows={3}
              {...registerDecline("rejection_reason")}
            />

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDeclineModalOpen(false)}
                disabled={isSubmittingDecline}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                isLoading={isSubmittingDecline}
              >
                Confirm Decline
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Create Pickup Modal Dialog */}
        <Dialog
          isOpen={isCreatePickupModalOpen}
          onClose={() => setIsCreatePickupModalOpen(false)}
          title="Schedule & Create Pickup Task"
          description="Establish transport coordination for this accepted donation match."
        >
          <form onSubmit={handleSubmitPickup(onCreatePickupSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                Logistics Transport Mode
              </label>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPickupTransportMode === "ORG_DIRECT"
                      ? "bg-sky-50 border-sky-300 ring-1 ring-sky-300"
                      : "bg-white border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    value="ORG_DIRECT"
                    className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    {...registerPickup("transport_mode")}
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 flex items-center">
                      <Truck className="h-3.5 w-3.5 mr-1 text-zinc-600" />
                      Direct Organization Pickup (Self-Transport)
                    </span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Your organization vehicle or staff will directly collect from the donor kitchen.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPickupTransportMode === "VOLUNTEER"
                      ? "bg-sky-50 border-sky-300 ring-1 ring-sky-300"
                      : "bg-white border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    value="VOLUNTEER"
                    className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    {...registerPickup("transport_mode")}
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 flex items-center">
                      <UserCheck className="h-3.5 w-3.5 mr-1 text-zinc-600" />
                      Volunteer Courier Dispatch
                    </span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Open this task to qualified volunteer couriers in your service area.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700 block mb-1">
                Preferred Scheduled Pickup Time (Optional)
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                {...registerPickup("scheduled_pickup_time")}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Leave empty for immediate dispatch window. Must be before the donor's pickup deadline.
              </p>
            </div>

            <Textarea
              label="Logistical Notes & Instructions (Optional)"
              placeholder="e.g. Loading dock access code, driver contact details, or parking instructions."
              error={errorsPickup.notes?.message}
              disabled={isSubmittingPickup}
              rows={2}
              {...registerPickup("notes")}
            />

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreatePickupModalOpen(false)}
                disabled={isSubmittingPickup}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSubmittingPickup}
              >
                Create Pickup Task
              </Button>
            </div>
          </form>
        </Dialog>
      </PageContainer>
    </AuthGuard>
  );
}
