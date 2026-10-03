"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Mail,
  MapPin,
  Phone,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Truck,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { LocationMap } from "@/components/maps/location-map";
import {
  useAdminOrganization,
  useRejectOrganization,
  useVerifyOrganization,
} from "@/hooks/use-admin-organizations";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminOrganizationDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const organizationId = resolvedParams.id;

  const { success, error: toastError } = useToast();

  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const {
    data: org,
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminOrganization(organizationId);

  const verifyMutation = useVerifyOrganization();
  const rejectMutation = useRejectOrganization();

  const handleVerify = async () => {
    if (!org) return;
    try {
      await verifyMutation.mutateAsync(org.id);
      success(`'${org.org_name}' is now verified and eligible for donation matches.`);
      setIsVerifyDialogOpen(false);
    } catch (err: any) {
      toastError(err?.message || "Failed to verify organization.");
    }
  };

  const handleReject = async () => {
    if (!org) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 3) {
      setReasonError("Please provide a valid rejection reason (minimum 3 characters).");
      return;
    }
    setReasonError("");

    try {
      await rejectMutation.mutateAsync({
        id: org.id,
        reason: trimmed,
      });
      success(`'${org.org_name}' verification application has been marked as rejected.`);
      setIsRejectDialogOpen(false);
      setRejectionReason("");
    } catch (err: any) {
      toastError(err?.message || "Failed to reject organization.");
    }
  };

  if (isLoading) {
    return (
      <AuthGuard allowedRoles={["ADMIN"]}>
        <PageContainer>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-9 w-32" />
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Skeleton className="h-64 md:col-span-2" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </PageContainer>
      </AuthGuard>
    );
  }

  if (isError || !org) {
    return (
      <AuthGuard allowedRoles={["ADMIN"]}>
        <PageContainer>
          <ErrorState
            title="Organization Not Found"
            message={error?.message || "The requested relief organization profile could not be located."}
            onRetry={refetch}
          />
        </PageContainer>
      </AuthGuard>
    );
  }

  const maxCap = Number(org.max_capacity_kg || 0);
  const currentCap = Number(org.current_capacity_kg || 0);
  const availableCap = Math.max(0, maxCap - currentCap);
  const utilizationPct = maxCap > 0 ? Math.min(100, Math.round((currentCap / maxCap) * 100)) : 0;

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <PageContainer>
        {/* Breadcrumb Navigation */}
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-zinc-500">
          <Link href="/app/admin" className="hover:text-zinc-800">
            Admin
          </Link>
          <span>/</span>
          <Link href="/app/admin/organizations" className="hover:text-zinc-800">
            Organizations
          </Link>
          <span>/</span>
          <span className="text-zinc-900 font-semibold truncate max-w-xs">{org.org_name}</span>
        </div>

        {/* Page Header */}
        <PageHeader
          title={org.org_name}
          description={`Registered ${org.org_type.replace(/_/g, " ")} facility intake review.`}
          badge={<StatusBadge status={org.verification_status} size="md" />}
          actions={
            <div className="flex items-center gap-2.5">
              <Link href="/app/admin/verifications">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back to Queue
                </Button>
              </Link>

              {org.verification_status !== "VERIFIED" && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsVerifyDialogOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  Verify Organization
                </Button>
              )}

              {org.verification_status !== "REJECTED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsRejectDialogOpen(true);
                    setRejectionReason("");
                    setReasonError("");
                  }}
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Reject Application
                </Button>
              )}
            </div>
          }
        />

        {/* Main Details Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column (2 Cols): Organization Info & Capacity */}
          <div className="space-y-6 lg:col-span-2">
            {/* Facility & Administrative Identity Card */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  Facility & Identity Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Organization Name</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-900">{org.org_name}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Facility Type</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-800">
                      {org.org_type.replace(/_/g, " ")}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">
                      Tax ID / Charity Registration
                    </p>
                    <p className="mt-0.5 text-sm font-mono text-zinc-900">
                      {org.tax_id ? (
                        <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-800">
                          {org.tax_id}
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic">None provided</span>
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Contact Phone</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-zinc-400" />
                      {org.contact_phone}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Owner Email</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-zinc-400" />
                      {org.owner_email || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Account Status</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant={org.is_active !== false ? "success" : "danger"} size="sm">
                        {org.is_active !== false ? "Active User" : "Inactive / Suspended"}
                      </Badge>
                      <Badge variant={org.can_pickup ? "info" : "secondary"} size="sm">
                        {org.can_pickup ? "Self-Pickup Enabled" : "Volunteer Pickup Only"}
                      </Badge>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Street Address</p>
                    <p className="mt-0.5 text-sm text-zinc-800">{org.address_text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage Capacity & Utilization */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-600" />
                  Intake Capacity & Storage
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <p className="text-xs font-semibold text-zinc-500">Maximum Limit</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900">{maxCap.toLocaleString()} kg</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <p className="text-xs font-semibold text-zinc-500">Current Occupied</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900">{currentCap.toLocaleString()} kg</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700">Available Room</p>
                    <p className="mt-1 text-xl font-bold text-emerald-700">{availableCap.toLocaleString()} kg</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1.5 font-medium">
                    <span>Capacity Utilization</span>
                    <span>{utilizationPct}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        utilizationPct > 80 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${utilizationPct}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Accepted Food Categories */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-600" />
                  Accepted Food Categories
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {org.accepted_categories.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No food categories registered.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {org.accepted_categories.map((cat) => (
                      <Badge key={cat} variant="success" size="md">
                        {cat.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column (1 Col): Spatial Map & System Timestamps */}
          <div className="space-y-6">
            {/* Spatial Location Map Card */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Facility Coordinates
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="overflow-hidden rounded-lg border border-zinc-200">
                  <LocationMap
                    center={org.location}
                    zoom={14}
                    height="240px"
                    markers={[
                      {
                        id: org.id,
                        position: org.location,
                        title: org.org_name,
                        description: org.address_text,
                        variant: "organization",
                      },
                    ]}
                    showExternalLinks={true}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-500 font-mono bg-zinc-50 p-2.5 rounded-lg">
                  <span>Lat: {org.location.latitude.toFixed(5)}</span>
                  <span>Lng: {org.location.longitude.toFixed(5)}</span>
                </div>
              </CardContent>
            </Card>

            {/* System Metadata Card */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-600" />
                  System Audit Record
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs text-zinc-600">
                <div>
                  <p className="font-semibold text-zinc-700">Organization ID</p>
                  <p className="font-mono text-[11px] text-zinc-500 break-all">{org.id}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-700">Owner User ID</p>
                  <p className="font-mono text-[11px] text-zinc-500 break-all">{org.user_id}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-700">Registration Date</p>
                  <p className="text-zinc-800 font-medium">
                    {new Date(org.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-700">Last Profile Update</p>
                  <p className="text-zinc-800 font-medium">
                    {new Date(org.updated_at).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Verification Confirmation Modal */}
        <ConfirmDialog
          isOpen={isVerifyDialogOpen}
          onClose={() => setIsVerifyDialogOpen(false)}
          onConfirm={handleVerify}
          title="Confirm Organization Verification"
          description={`Verify '${org.org_name}'? The organization will immediately become active in algorithmic match offers and can accept incoming food surplus donations.`}
          confirmText="Verify Organization"
          cancelText="Cancel"
          variant="primary"
          isLoading={verifyMutation.isPending}
        />

        {/* Rejection Modal Dialog */}
        <Dialog
          isOpen={isRejectDialogOpen}
          onClose={() => {
            setIsRejectDialogOpen(false);
            setRejectionReason("");
            setReasonError("");
          }}
          title="Reject Organization Verification"
          description={`State the reason for rejecting '${org.org_name}'. This explanation will be logged and dispatched to the facility owner.`}
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <Textarea
                rows={4}
                placeholder="E.g., Could not verify non-profit charter or contact telephone number."
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  if (reasonError) setReasonError("");
                }}
                className={reasonError ? "border-rose-400 focus:ring-rose-500" : ""}
              />
              {reasonError && (
                <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {reasonError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRejectDialogOpen(false)}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleReject}
                isLoading={rejectMutation.isPending}
              >
                Reject Application
              </Button>
            </div>
          </div>
        </Dialog>
      </PageContainer>
    </AuthGuard>
  );
}
