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
  RotateCcw,
  ShieldAlert,
  Truck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useCancelPickup, usePickup } from "@/hooks/use-pickups";
import { useDonation } from "@/hooks/use-donations";
import {
  PickupCancelFormData,
  pickupCancelSchema,
} from "@/lib/validation/pickup-action";
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
import { LocationMap } from "@/components/maps/location-map";

export default function BusinessPickupDetailPage() {
  const params = useParams<{ pickupId: string }>();
  const router = useRouter();
  const pickupId = params.pickupId;

  const { data: pickup, isLoading, isError, refetch } = usePickup(pickupId);
  const { data: donation } = useDonation(pickup?.donation_id || "");

  const cancelMutation = useCancelPickup();
  const { success, error: toastError } = useToast();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const onCancelSubmit = async (data: PickupCancelFormData) => {
    setActionError(null);
    try {
      await cancelMutation.mutateAsync({
        pickupId,
        data: { cancellation_reason: data.cancellation_reason },
      });
      setIsCancelModalOpen(false);
      resetCancel();
      success("Pickup cancelled successfully.", "Pickup Cancelled");
    } catch (err: any) {
      const msg = err?.detail || "Failed to cancel pickup.";
      setActionError(msg);
      toastError(msg, "Cancellation Failed");
    }
  };

  const isTerminal =
    pickup?.status === "DELIVERED" ||
    pickup?.status === "CANCELLED" ||
    pickup?.status === "FAILED";

  return (
    <AuthGuard allowedRoles={["FOOD_BUSINESS"]}>
      <PageContainer>
        <div className="mb-2">
          <Link
            href="/app/business/pickups"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Scheduled Pickups
          </Link>
        </div>

        <PageHeader
          title="Pickup Logistics Detail"
          description={`Transport monitoring for Task #${pickupId.slice(0, 8)}`}
          actions={
            pickup &&
            !isTerminal && (
              <div className="flex items-center space-x-2">
                {donation && (
                  <Link href={`/app/business/donations/${donation.id}`}>
                    <Button size="sm" variant="outline" leftIcon={<Layers className="h-3.5 w-3.5 mr-1" />}>
                      View Donation
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setActionError(null);
                    setIsCancelModalOpen(true);
                  }}
                >
                  Cancel Pickup
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
                title="Operation Error"
                onDismiss={() => setActionError(null)}
              >
                {actionError}
              </Alert>
            )}

            {/* Status Banners */}
            {pickup.status === "ASSIGNED" && (
              <Alert variant="info" title="Pickup Scheduled">
                {pickup.transport_mode === "ORG_DIRECT"
                  ? "The recipient organization will arrive with self-transport vehicles."
                  : pickup.volunteer_id
                  ? "A volunteer courier has been assigned to pick up this surplus food donation."
                  : "The recipient organization requested volunteer courier dispatch. Dispatch is pending."}
              </Alert>
            )}

            {pickup.status === "IN_TRANSIT" && (
              <Alert variant="warning" title="Food in Transit">
                The food has been collected and is currently being transported to the recipient organization.
              </Alert>
            )}

            {pickup.status === "DELIVERED" && (
              <Alert variant="success" title="Delivery Complete">
                The food donation was confirmed delivered and received by the recipient organization.
              </Alert>
            )}

            {pickup.status === "CANCELLED" && (
              <Alert variant="error" title="Pickup Cancelled">
                This pickup task was cancelled. The donation has been reset to available for matching.
              </Alert>
            )}

            {pickup.status === "FAILED" && (
              <Alert variant="error" title="Delivery Failed">
                This delivery attempt failed and was recorded in the audit log.
              </Alert>
            )}

            {/* Overview Card */}
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
                      {donation ? (
                        <span>
                          Donation: <strong>{donation.title}</strong> ({donation.total_weight_kg} kg - {donation.food_category.replace(/_/g, " ")})
                        </span>
                      ) : (
                        <span>Donation Reference: <span className="font-mono">{pickup.donation_id}</span></span>
                      )}
                    </CardDescription>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
                      Transport: {pickup.transport_mode === "ORG_DIRECT" ? "Recipient Direct Pickup" : "Volunteer Courier"}
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
                      Collection / Departure
                    </span>
                    <div className="mt-1.5 flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs font-semibold text-zinc-900">
                        {pickup.picked_up_at
                          ? new Date(pickup.picked_up_at).toLocaleString()
                          : "Not departed yet"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Delivered Confirmation
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

                {/* Volunteer Courier Card if volunteer assigned */}
                {pickup.transport_mode === "VOLUNTEER" && pickup.volunteer_id && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                        <UserCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                          Volunteer Courier Assigned
                        </p>
                        <p className="text-xs font-mono text-emerald-800">
                          Courier ID: {pickup.volunteer_id}
                        </p>
                      </div>
                    </div>
                    <Badge variant="success" size="md">
                      Active
                    </Badge>
                  </div>
                )}

                {/* Pickup Location Map Preview */}
                {donation && (
                  <div className="pt-2 border-t border-zinc-100">
                    <LocationMap
                      title="Pickup Location Map"
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
                      Logistical Notes & Instructions
                    </span>
                    <p className="mt-1 text-xs text-zinc-800 whitespace-pre-line leading-relaxed">
                      {pickup.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cancel Modal Dialog */}
        <Dialog
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          title="Cancel Pickup Task"
          description="Cancelling will release the pickup task and return the donation to available status."
        >
          <form onSubmit={handleSubmitCancel(onCancelSubmit)} className="space-y-4">
            <Textarea
              label="Cancellation Reason (Required)"
              placeholder="e.g. Surplus food was already distributed or kitchen closing early."
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
                Keep Pickup
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
      </PageContainer>
    </AuthGuard>
  );
}
