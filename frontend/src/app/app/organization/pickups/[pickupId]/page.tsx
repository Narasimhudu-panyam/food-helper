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
  Compass,
  KeyRound,
  Layers,
  MapPin,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Undo2,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useAssignVolunteer,
  useCancelPickup,
  useCompletePickup,
  useFailPickup,
  usePickup,
  usePickupVolunteers,
  useReleaseVolunteer,
  useStartPickup,
} from "@/hooks/use-pickups";
import { useDonation } from "@/hooks/use-donations";
import { LocationMap } from "@/components/maps/location-map";
import {
  PickupCancelFormData,
  PickupCompleteFormData,
  PickupFailFormData,
  pickupCancelSchema,
  pickupCompleteSchema,
  pickupFailSchema,
} from "@/lib/validation/pickup-action";
import { CandidateVolunteerMatchResponse } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default function OrganizationPickupDetailPage() {
  const params = useParams<{ pickupId: string }>();
  const router = useRouter();
  const pickupId = params.pickupId;

  const { data: pickup, isLoading, isError, refetch } = usePickup(pickupId);
  const { data: donation } = useDonation(pickup?.donation_id);

  const isVolunteerTransport = pickup?.transport_mode === "VOLUNTEER";
  const needsVolunteerAssignment =
    isVolunteerTransport && pickup?.status === "ASSIGNED" && !pickup?.volunteer_id;

  const {
    data: volunteerCandidatesData,
    isLoading: isLoadingCandidates,
    refetch: refetchCandidates,
  } = usePickupVolunteers(pickupId, needsVolunteerAssignment);

  // Mutations
  const startMutation = useStartPickup();
  const completeMutation = useCompletePickup();
  const cancelMutation = useCancelPickup();
  const failMutation = useFailPickup();
  const assignMutation = useAssignVolunteer();
  const releaseMutation = useReleaseVolunteer();

  const { success, error: toastError } = useToast();

  // Modals state
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isFailModalOpen, setIsFailModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Complete Delivery Form
  const {
    register: registerComplete,
    handleSubmit: handleSubmitComplete,
    reset: resetComplete,
    formState: { errors: errorsComplete, isSubmitting: isSubmittingComplete },
  } = useForm<PickupCompleteFormData>({
    resolver: zodResolver(pickupCompleteSchema),
    defaultValues: {
      dropoff_confirmation_pin: "",
      notes: "",
    },
  });

  // Cancel Form
  const {
    register: registerCancel,
    handleSubmit: handleSubmitCancel,
    reset: resetCancel,
    formState: { errors: errorsCancel, isSubmitting: isSubmittingCancel },
  } = useForm<PickupCancelFormData>({
    resolver: zodResolver(pickupCancelSchema),
    defaultValues: {
      cancellation_reason: "",
    },
  });

  // Fail Form
  const {
    register: registerFail,
    handleSubmit: handleSubmitFail,
    reset: resetFail,
    formState: { errors: errorsFail, isSubmitting: isSubmittingFail },
  } = useForm<PickupFailFormData>({
    resolver: zodResolver(pickupFailSchema),
    defaultValues: {
      failure_reason: "",
    },
  });

  const handleStartPickup = async () => {
    setActionError(null);
    try {
      await startMutation.mutateAsync(pickupId);
      success("Pickup started. Vehicle is now in transit.", "En Route");
    } catch (err: any) {
      const msg = err?.detail || "Failed to start pickup transport.";
      setActionError(msg);
      toastError(msg, "Action Failed");
    }
  };

  const onCompleteSubmit = async (data: PickupCompleteFormData) => {
    setActionError(null);
    try {
      await completeMutation.mutateAsync({
        pickupId,
        data: {
          dropoff_confirmation_pin: data.dropoff_confirmation_pin || null,
          notes: data.notes || null,
        },
      });
      setIsCompleteModalOpen(false);
      resetComplete();
      success("Delivery confirmed and donation successfully marked as delivered.", "Delivery Complete");
    } catch (err: any) {
      const msg = err?.detail || "Failed to complete delivery receipt.";
      setActionError(msg);
      toastError(msg, "Completion Failed");
    }
  };

  const onCancelSubmit = async (data: PickupCancelFormData) => {
    setActionError(null);
    try {
      await cancelMutation.mutateAsync({
        pickupId,
        data: { cancellation_reason: data.cancellation_reason },
      });
      setIsCancelModalOpen(false);
      resetCancel();
      success("Pickup cancelled and reserved capacity released.", "Pickup Cancelled");
    } catch (err: any) {
      const msg = err?.detail || "Failed to cancel pickup.";
      setActionError(msg);
      toastError(msg, "Cancellation Failed");
    }
  };

  const onFailSubmit = async (data: PickupFailFormData) => {
    setActionError(null);
    try {
      await failMutation.mutateAsync({
        pickupId,
        data: { failure_reason: data.failure_reason },
      });
      setIsFailModalOpen(false);
      resetFail();
      success("Delivery recorded as failed and reserved capacity released.", "Delivery Failed");
    } catch (err: any) {
      const msg = err?.detail || "Failed to record failed delivery.";
      setActionError(msg);
      toastError(msg, "Action Failed");
    }
  };

  const handleAssignVolunteer = async (volunteerId: string) => {
    setActionError(null);
    try {
      await assignMutation.mutateAsync({
        pickupId,
        data: { volunteer_id: volunteerId },
      });
      success("Volunteer courier assigned to pickup task.", "Courier Dispatched");
    } catch (err: any) {
      const msg = err?.detail || "Failed to assign volunteer courier.";
      setActionError(msg);
      toastError(msg, "Assignment Failed");
    }
  };

  const handleReleaseVolunteer = async () => {
    setActionError(null);
    try {
      await releaseMutation.mutateAsync(pickupId);
      setIsReleaseModalOpen(false);
      success("Volunteer unassigned. Task returned to dispatch queue.", "Courier Released");
    } catch (err: any) {
      const msg = err?.detail || "Failed to release volunteer courier.";
      setActionError(msg);
      toastError(msg, "Release Failed");
    }
  };

  const isTerminal =
    pickup?.status === "DELIVERED" ||
    pickup?.status === "CANCELLED" ||
    pickup?.status === "FAILED";

  return (
    <AuthGuard allowedRoles={["ORGANIZATION"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href="/app/organization/pickups"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Pickups
          </Link>
        </div>

        <PageHeader
          title="Pickup Task Management"
          description={`Logistics coordination for Task #${pickupId.slice(0, 8)}`}
          actions={
            pickup &&
            !isTerminal && (
              <div className="flex flex-wrap items-center gap-2">
                {pickup.transport_mode === "ORG_DIRECT" && pickup.status === "ASSIGNED" && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleStartPickup}
                    isLoading={startMutation.isPending}
                    leftIcon={<Play className="h-3.5 w-3.5 mr-1" />}
                  >
                    Start Transport
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    setActionError(null);
                    setIsCompleteModalOpen(true);
                  }}
                  leftIcon={<CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                >
                  Confirm Delivery
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActionError(null);
                    setIsCancelModalOpen(true);
                  }}
                >
                  Cancel Pickup
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setActionError(null);
                    setIsFailModalOpen(true);
                  }}
                >
                  Report Failure
                </Button>
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
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : isError ? (
          <Alert variant="error" title="Unable to load pickup details">
            Failed to fetch pickup task. You may not have permission to view it.
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
        ) : !pickup ? (
          <Alert variant="warning" title="Pickup Not Found">
            The requested pickup task could not be located.
          </Alert>
        ) : (
          <div className="space-y-6">
            {actionError && (
              <Alert
                variant="error"
                title="Logistics Action Error"
                onDismiss={() => setActionError(null)}
              >
                {actionError}
              </Alert>
            )}

            {/* Status Banners */}
            {pickup.status === "ASSIGNED" && (
              <Alert variant="info" title="Pickup Task Scheduled">
                {pickup.transport_mode === "ORG_DIRECT"
                  ? "This pickup is designated for direct organization pickup. Click 'Start Transport' when your driver departs."
                  : pickup.volunteer_id
                  ? "A volunteer courier has been assigned to transport this donation."
                  : "Awaiting volunteer courier dispatch. Review eligible volunteers below to assign a courier."}
              </Alert>
            )}

            {pickup.status === "IN_TRANSIT" && (
              <Alert variant="warning" title="Delivery in Transit">
                Food transport is currently en route. When the food arrives and has been inspected at your facility, click <strong>Confirm Delivery</strong>.
              </Alert>
            )}

            {pickup.status === "DELIVERED" && (
              <Alert variant="success" title="Delivery Complete">
                This food donation has been successfully delivered and confirmed at your facility.
              </Alert>
            )}

            {pickup.status === "CANCELLED" && (
              <Alert variant="error" title="Pickup Cancelled">
                This pickup task was cancelled. Reserved storage capacity has been released.
              </Alert>
            )}

            {pickup.status === "FAILED" && (
              <Alert variant="error" title="Delivery Attempt Failed">
                This delivery attempt was marked as failed. Reserved capacity has been released.
              </Alert>
            )}

            {/* Pickup Details Overview Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center space-x-2.5">
                      <CardTitle className="text-lg font-bold text-zinc-900">
                        Pickup #{pickup.id.slice(0, 8)}
                      </CardTitle>
                      <StatusBadge status={pickup.status} />
                    </div>
                    <CardDescription className="mt-1">
                      Donation Reference: <span className="font-mono">{pickup.donation_id}</span>
                    </CardDescription>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
                      Transport: {pickup.transport_mode === "ORG_DIRECT" ? "Direct Self-Transport" : "Volunteer Courier"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Scheduled Window
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-semibold text-zinc-900">
                        {pickup.scheduled_pickup_time
                          ? new Date(pickup.scheduled_pickup_time).toLocaleString()
                          : "Immediate Dispatch Window"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Departure / In-Transit
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-semibold text-zinc-900">
                        {pickup.picked_up_at
                          ? new Date(pickup.picked_up_at).toLocaleString()
                          : "Not picked up yet"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Delivery Receipt
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <CheckCircle2 className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-semibold text-zinc-900">
                        {pickup.delivered_at
                          ? new Date(pickup.delivered_at).toLocaleString()
                          : "Pending receipt"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pickup Location Map Preview */}
                {donation && (
                  <div className="pt-2 border-t border-zinc-100">
                    <LocationMap
                      title="Pickup Site (Donation Location)"
                      center={donation.location}
                      markers={[
                        {
                          position: donation.location,
                          title: donation.title,
                          description: `Collection point for donation #${donation.id.slice(0, 8)}`,
                          variant: "donation",
                        },
                      ]}
                      height="240px"
                    />
                  </div>
                )}

                {pickup.notes && (
                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Logistical Notes & History
                    </span>
                    <p className="mt-1 text-xs text-zinc-800 whitespace-pre-line leading-relaxed">
                      {pickup.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Volunteer Dispatch & Courier Assignment Section */}
            {isVolunteerTransport && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-zinc-900 flex items-center">
                        <UserCheck className="h-4 w-4 mr-2 text-emerald-600" />
                        Volunteer Courier Dispatch
                      </CardTitle>
                      <CardDescription>
                        Community volunteer courier assignment for this delivery.
                      </CardDescription>
                    </div>

                    {pickup.volunteer_id && pickup.status === "ASSIGNED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsReleaseModalOpen(true)}
                        leftIcon={<Undo2 className="h-3.5 w-3.5 mr-1" />}
                      >
                        Unassign Courier
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pickup.volunteer_id ? (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                          <UserCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                            Courier Assigned
                          </p>
                          <p className="text-xs font-mono text-emerald-800">
                            Volunteer ID: {pickup.volunteer_id}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success" size="md">
                        Active Assignment
                      </Badge>
                    </div>
                  ) : pickup.status === "ASSIGNED" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-zinc-500 pb-1">
                        <span>
                          Eligible Volunteers in Proximity:{" "}
                          <strong>{volunteerCandidatesData?.total_candidates_found ?? 0}</strong>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => refetchCandidates()}
                          className="h-7 text-xs"
                          leftIcon={<RotateCcw className="h-3 w-3 mr-1" />}
                        >
                          Refresh Candidates
                        </Button>
                      </div>

                      {isLoadingCandidates ? (
                        <div className="space-y-2">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ) : !volunteerCandidatesData ||
                        volunteerCandidatesData.matches.length === 0 ? (
                        <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-center text-xs text-zinc-500">
                          No available volunteer couriers currently in range with suitable transport equipment.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white overflow-hidden">
                          {volunteerCandidatesData.matches.map(
                            (candidate: CandidateVolunteerMatchResponse) => (
                              <div
                                key={candidate.volunteer_id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 gap-3 hover:bg-zinc-50"
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-900">
                                      {candidate.full_name}
                                    </span>
                                    <Badge variant="default" size="sm">
                                      {candidate.vehicle_type.replace(/_/g, " ")}
                                    </Badge>
                                    {candidate.has_insulated_bags && (
                                      <Badge variant="success" size="sm">
                                        Insulated Equipment
                                      </Badge>
                                    )}
                                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                      Score: {candidate.score.toFixed(0)}/100
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
                                    <span className="flex items-center">
                                      <MapPin className="h-3 w-3 mr-1 text-zinc-400" />
                                      {candidate.distance_km.toFixed(1)} km away
                                    </span>
                                    <span>•</span>
                                    <span>Radius: {candidate.service_radius_km.toFixed(0)} km</span>
                                  </div>
                                </div>

                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleAssignVolunteer(candidate.volunteer_id)}
                                  isLoading={assignMutation.isPending}
                                  className="shrink-0"
                                >
                                  Assign Courier
                                </Button>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-xs text-zinc-500">
                      Volunteer courier assignment is closed for this pickup status.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Complete Delivery Modal Dialog */}
        <Dialog
          isOpen={isCompleteModalOpen}
          onClose={() => setIsCompleteModalOpen(false)}
          title="Confirm Delivery Receipt"
          description="Acknowledge physical arrival and food inspection at your receiving facility."
        >
          <form onSubmit={handleSubmitComplete(onCompleteSubmit)} className="space-y-4">
            <Input
              label="Dropoff Confirmation / Inspection Code (Optional)"
              placeholder="e.g. 839201"
              error={errorsComplete.dropoff_confirmation_pin?.message}
              disabled={isSubmittingComplete}
              {...registerComplete("dropoff_confirmation_pin")}
            />

            <Textarea
              label="Inspection Notes (Optional)"
              placeholder="e.g. Verified temperature below 4°C, tamper-evident packaging intact."
              error={errorsComplete.notes?.message}
              disabled={isSubmittingComplete}
              rows={3}
              {...registerComplete("notes")}
            />

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCompleteModalOpen(false)}
                disabled={isSubmittingComplete}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                isLoading={isSubmittingComplete}
              >
                Confirm Receipt & Complete
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Cancel Modal Dialog */}
        <Dialog
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          title="Cancel Pickup Task"
          description="Cancelling will release reserved facility capacity and reset the donation to available status."
        >
          <form onSubmit={handleSubmitCancel(onCancelSubmit)} className="space-y-4">
            <Textarea
              label="Cancellation Reason (Required)"
              placeholder="e.g. Storage equipment failure or transport logistics unavailable."
              error={errorsCancel.cancellation_reason?.message}
              disabled={isSubmittingCancel}
              rows={3}
              {...registerCancel("cancellation_reason")}
            />

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={isSubmittingCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                isLoading={isSubmittingCancel}
              >
                Confirm Cancellation
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Fail Modal Dialog */}
        <Dialog
          isOpen={isFailModalOpen}
          onClose={() => setIsFailModalOpen(false)}
          title="Report Failed Delivery Attempt"
          description="Record a delivery failure and release reserved facility capacity."
        >
          <form onSubmit={handleSubmitFail(onFailSubmit)} className="space-y-4">
            <Textarea
              label="Failure Reason (Required)"
              placeholder="e.g. Donor premises closed, food damaged in transit, or delivery unreachable."
              error={errorsFail.failure_reason?.message}
              disabled={isSubmittingFail}
              rows={3}
              {...registerFail("failure_reason")}
            />

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsFailModalOpen(false)}
                disabled={isSubmittingFail}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                isLoading={isSubmittingFail}
              >
                Submit Failure Report
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Release Volunteer Modal Dialog */}
        <Dialog
          isOpen={isReleaseModalOpen}
          onClose={() => setIsReleaseModalOpen(false)}
          title="Unassign Volunteer Courier?"
          description="Are you sure you want to release this volunteer courier? The delivery will be returned to the dispatch matching queue and the volunteer will become available for other routes."
        >
          <div className="space-y-4 pt-2">
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReleaseModalOpen(false)}
                disabled={releaseMutation.isPending}
              >
                Keep Courier
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleReleaseVolunteer}
                isLoading={releaseMutation.isPending}
              >
                Confirm Unassignment
              </Button>
            </div>
          </div>
        </Dialog>
      </PageContainer>
    </AuthGuard>
  );
}
