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
  MapPin,
  Play,
  RotateCcw,
  ShieldAlert,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import {
  useFailPickup,
  usePickup,
  useReleaseVolunteer,
  useStartPickup,
} from "@/hooks/use-pickups";
import { useDonation } from "@/hooks/use-donations";
import { LocationMap } from "@/components/maps/location-map";
import {
  PickupFailFormData,
  pickupFailSchema,
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

export default function VolunteerPickupDetailPage() {
  const params = useParams<{ pickupId: string }>();
  const router = useRouter();
  const pickupId = params.pickupId;

  const { data: pickup, isLoading, isError, refetch } = usePickup(pickupId);
  const { data: donation } = useDonation(pickup?.donation_id);
  const startMutation = useStartPickup();
  const releaseMutation = useReleaseVolunteer();
  const failMutation = useFailPickup();
  const { success, error: toastError } = useToast();

  const [isReleaseDialogOpen, setIsReleaseDialogOpen] = useState(false);
  const [isFailDialogOpen, setIsFailDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      success("Pickup started. Delivery is now in transit.", "In Transit");
    } catch (err: any) {
      const msg = err?.detail || "Failed to start pickup. Please try again.";
      setActionError(msg);
      toastError(msg, "Action Failed");
    }
  };

  const handleReleasePickup = async () => {
    setActionError(null);
    try {
      await releaseMutation.mutateAsync(pickupId);
      setIsReleaseDialogOpen(false);
      success("Pickup released. Your availability has been restored.", "Task Released");
      router.push("/app/volunteer/pickups");
    } catch (err: any) {
      const msg = err?.detail || "Failed to release pickup assignment.";
      setActionError(msg);
      toastError(msg, "Release Failed");
    }
  };

  const onFailSubmit = async (data: PickupFailFormData) => {
    setActionError(null);
    try {
      await failMutation.mutateAsync({
        pickupId,
        data: { failure_reason: data.failure_reason },
      });
      setIsFailDialogOpen(false);
      resetFail();
      success("Delivery marked as failed. Capacity has been restored.", "Delivery Recorded");
    } catch (err: any) {
      const msg = err?.detail || "Failed to record failed delivery attempt.";
      setActionError(msg);
      toastError(msg, "Action Failed");
    }
  };

  return (
    <AuthGuard allowedRoles={["VOLUNTEER"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href="/app/volunteer/pickups"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to My Pickups
          </Link>
        </div>

        <PageHeader
          title="Delivery Coordination"
          description={`Task #${pickupId.slice(0, 8)} transport lifecycle`}
          actions={
            pickup &&
            pickup.status === "ASSIGNED" && (
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsReleaseDialogOpen(true)}
                  leftIcon={<Undo2 className="h-3.5 w-3.5 mr-1" />}
                >
                  Release Task
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleStartPickup}
                  isLoading={startMutation.isPending}
                  leftIcon={<Play className="h-3.5 w-3.5 mr-1" />}
                >
                  Start Delivery
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
            Failed to fetch delivery task. It may not exist or you may not be assigned to it.
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
            The requested transport task could not be located.
          </Alert>
        ) : (
          <div className="space-y-6">
            {actionError && (
              <Alert
                variant="error"
                title="Operation Error"
                onDismiss={() => setActionError(null)}
              >
                {actionError}
              </Alert>
            )}

            {/* Status Banners */}
            {pickup.status === "ASSIGNED" && (
              <Alert variant="info" title="Task Ready to Start">
                You are assigned to this transport task. Click <strong>Start Delivery</strong> when you begin driving to the donor pickup location.
              </Alert>
            )}

            {pickup.status === "IN_TRANSIT" && (
              <Alert variant="warning" title="Delivery in Transit">
                You are currently en route. Transport the food directly to the recipient organization.
              </Alert>
            )}

            {pickup.status === "DELIVERED" && (
              <Alert variant="success" title="Delivery Complete">
                The food donation has been successfully delivered and confirmed by the recipient organization.
              </Alert>
            )}

            {pickup.status === "FAILED" && (
              <Alert variant="error" title="Delivery Failed">
                This delivery task was recorded as failed. Reserved capacity has been released.
              </Alert>
            )}

            {/* Pickup Details Card */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center space-x-2.5">
                      <CardTitle className="text-lg font-bold text-zinc-900">
                        Pickup Task #{pickup.id.slice(0, 8)}
                      </CardTitle>
                      <StatusBadge status={pickup.status} />
                    </div>
                    <CardDescription className="mt-1">
                      Donation Reference: <span className="font-mono">{pickup.donation_id}</span>
                    </CardDescription>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
                      Transport Mode: {pickup.transport_mode.replace(/_/g, " ")}
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
                      Pickup / Departure
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
                      Delivery Confirmation
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
                      title="Collection Site (Pickup Coordinates)"
                      center={donation.location}
                      markers={[
                        {
                          position: donation.location,
                          title: donation.title,
                          description: `Donation pickup site (#${donation.id.slice(0, 8)})`,
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
                      Logistical Notes & Instructions
                    </span>
                    <p className="mt-1.5 text-xs text-zinc-800 leading-relaxed">
                      {pickup.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lifecycle Action Box */}
            {pickup.status === "ASSIGNED" && (
              <Card className="border-sky-200 bg-sky-50/30">
                <CardHeader>
                  <CardTitle className="text-base text-sky-950">
                    Begin Delivery Route
                  </CardTitle>
                  <CardDescription className="text-sky-800">
                    When you are ready to depart, click <strong>Start Delivery</strong> to transition the status to in-transit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleStartPickup}
                      isLoading={startMutation.isPending}
                      leftIcon={<Play className="h-4 w-4 mr-1" />}
                    >
                      Start Delivery (In-Transit)
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setIsReleaseDialogOpen(true)}
                      leftIcon={<Undo2 className="h-4 w-4 mr-1" />}
                    >
                      Release Assignment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {pickup.status === "IN_TRANSIT" && (
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader>
                  <CardTitle className="text-base text-amber-950">
                    In-Transit Operations
                  </CardTitle>
                  <CardDescription className="text-amber-800">
                    Delivery confirmation is completed by the recipient organization upon arrival. If an unexpected delivery obstacle occurs, you can record a failure report.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsFailDialogOpen(true)}
                    leftIcon={<XCircle className="h-4 w-4 mr-1" />}
                  >
                    Report Failed Delivery
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Release Confirmation Dialog */}
        <Dialog
          isOpen={isReleaseDialogOpen}
          onClose={() => setIsReleaseDialogOpen(false)}
          title="Release Pickup Assignment?"
          description="Are you sure you want to unclaim this transport task? Releasing it will return the delivery to the dispatch matching queue and restore your online availability."
        >
          <div className="space-y-4 pt-2">
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReleaseDialogOpen(false)}
                disabled={releaseMutation.isPending}
              >
                Keep Assignment
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReleasePickup}
                isLoading={releaseMutation.isPending}
              >
                Confirm Release
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Fail Delivery Dialog */}
        <Dialog
          isOpen={isFailDialogOpen}
          onClose={() => setIsFailDialogOpen(false)}
          title="Report Failed Delivery Attempt"
          description="State the reason why the food donation could not be delivered (e.g. establishment closed, spoiled on arrival, recipient inaccessible)."
        >
          <form onSubmit={handleSubmitFail(onFailSubmit)} className="space-y-4 pt-2">
            <Textarea
              label="Failure Reason"
              placeholder="e.g. Recipient facility was closed upon arrival and contact phone was unanswered."
              error={errorsFail.failure_reason?.message}
              disabled={isSubmittingFail}
              rows={3}
              {...registerFail("failure_reason")}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsFailDialogOpen(false)}
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
      </PageContainer>
    </AuthGuard>
  );
}
