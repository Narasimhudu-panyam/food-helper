"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Filter,
  Layers,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  useAdminOrganizations,
  useRejectOrganization,
  useVerifyOrganization,
} from "@/hooks/use-admin-organizations";
import { AdminOrganization, OrgVerificationStatus } from "@/types";

export default function AdminVerificationQueuePage() {
  const { success, error: toastError } = useToast();
  const [statusFilter, setStatusFilter] = useState<OrgVerificationStatus | "ALL">("PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Verification & Rejection action state
  const [verifyingOrg, setVerifyingOrg] = useState<AdminOrganization | null>(null);
  const [rejectingOrg, setRejectingOrg] = useState<AdminOrganization | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const verifyMutation = useVerifyOrganization();
  const rejectMutation = useRejectOrganization();

  // Fetch organizations
  const {
    data: organizations = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminOrganizations({
    verification_status: statusFilter === "ALL" ? undefined : statusFilter,
    search: debouncedSearch || undefined,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    // Simple debounce
    const timer = setTimeout(() => {
      setDebouncedSearch(val.trim());
    }, 300);
    return () => clearTimeout(timer);
  };

  const handleConfirmVerify = async () => {
    if (!verifyingOrg) return;
    try {
      await verifyMutation.mutateAsync(verifyingOrg.id);
      success(`'${verifyingOrg.org_name}' has been successfully verified.`);
      setVerifyingOrg(null);
    } catch (err: any) {
      toastError(err?.message || "Failed to verify organization.");
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrg) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 3) {
      setReasonError("Please provide a specific rejection reason (minimum 3 characters).");
      return;
    }
    setReasonError("");

    try {
      await rejectMutation.mutateAsync({
        id: rejectingOrg.id,
        reason: trimmed,
      });
      success(`'${rejectingOrg.org_name}' verification was marked as rejected.`);
      setRejectingOrg(null);
      setRejectionReason("");
    } catch (err: any) {
      toastError(err?.message || "Failed to reject organization.");
    }
  };

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <PageContainer>
        <PageHeader
          title="Organization Verification Queue"
          description="Review charity registration credentials, food capacity, and intake safety before approving organizations for live donation matching."
          badge={
            <Badge variant="warning" size="sm">
              <ShieldCheck className="mr-1 h-3.5 w-3.5 text-amber-600" />
              Administrative Review
            </Badge>
          }
        />

        {/* Filter and Search Bar */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { label: "Pending Review", value: "PENDING" },
                  { label: "Verified", value: "VERIFIED" },
                  { label: "Rejected", value: "REJECTED" },
                  { label: "Suspended", value: "SUSPENDED" },
                  { label: "All Statuses", value: "ALL" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    statusFilter === tab.value
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Search name, address, tax ID..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </Card>

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                  <Skeleton className="h-9 w-28" />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="Failed to Load Organizations"
            message={error?.message || "Could not retrieve the organization queue from the database."}
            onRetry={refetch}
          />
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6 text-zinc-400" />}
            title={
              statusFilter === "PENDING"
                ? "No Pending Organizations in Queue"
                : "No Organizations Found"
            }
            description={
              statusFilter === "PENDING"
                ? "All relief organization verification requests have been processed. Great job!"
                : "No organization profiles matched the selected status and search filters."
            }
            action={
              statusFilter !== "ALL"
                ? {
                    label: "View All Organizations",
                    onClick: () => setStatusFilter("ALL"),
                    variant: "outline",
                  }
                : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
                <thead className="bg-zinc-50 font-semibold text-zinc-700 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">
                      Organization
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Tax / Charity ID
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Owner & Contact
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Capacity & Intake
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Submitted
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-zinc-50/75 transition-colors">
                      {/* Name & Type */}
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <Link
                              href={`/app/admin/organizations/${org.id}`}
                              className="font-semibold text-zinc-900 hover:text-emerald-600 hover:underline"
                            >
                              {org.org_name}
                            </Link>
                            <p className="text-zinc-500 text-[11px] font-medium">
                              {org.org_type.replace(/_/g, " ")} • {org.address_text}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Tax ID */}
                      <td className="px-4 py-4 font-mono text-zinc-600">
                        {org.tax_id ? (
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-800">
                            {org.tax_id}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">Not provided</span>
                        )}
                      </td>

                      {/* Owner Email & Phone */}
                      <td className="px-4 py-4">
                        <p className="text-zinc-900 font-medium">{org.owner_email || "N/A"}</p>
                        <p className="text-zinc-500 text-[11px]">{org.contact_phone}</p>
                      </td>

                      {/* Capacity & Categories */}
                      <td className="px-4 py-4">
                        <p className="font-semibold text-zinc-800">
                          {Number(org.max_capacity_kg).toLocaleString()} kg max
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {org.accepted_categories.slice(0, 2).map((cat) => (
                            <span
                              key={cat}
                              className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                            >
                              {cat}
                            </span>
                          ))}
                          {org.accepted_categories.length > 2 && (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                              +{org.accepted_categories.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Verification Status */}
                      <td className="px-4 py-4">
                        <StatusBadge status={org.verification_status} size="sm" />
                      </td>

                      {/* Created Date */}
                      <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">
                        {new Date(org.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/app/admin/organizations/${org.id}`}>
                            <Button variant="outline" size="sm">
                              Review
                            </Button>
                          </Link>

                          {org.verification_status !== "VERIFIED" && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setVerifyingOrg(org)}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              Verify
                            </Button>
                          )}

                          {org.verification_status !== "REJECTED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRejectingOrg(org);
                                setRejectionReason("");
                                setReasonError("");
                              }}
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            >
                              Reject
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Verification Confirmation Modal */}
        <ConfirmDialog
          isOpen={Boolean(verifyingOrg)}
          onClose={() => setVerifyingOrg(null)}
          onConfirm={handleConfirmVerify}
          title="Verify Organization"
          description={`Are you sure you want to verify '${verifyingOrg?.org_name}'? Once verified, this organization will immediately become eligible to receive automated surplus food donations from local food businesses.`}
          confirmText="Verify Organization"
          cancelText="Cancel"
          variant="primary"
          isLoading={verifyMutation.isPending}
        />

        {/* Rejection Reason Modal Dialog */}
        <Dialog
          isOpen={Boolean(rejectingOrg)}
          onClose={() => {
            setRejectingOrg(null);
            setRejectionReason("");
            setReasonError("");
          }}
          title="Reject Organization Verification"
          description={`Provide an audited reason for rejecting '${rejectingOrg?.org_name}'. The organization owner will be notified of this reason.`}
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <Textarea
                rows={4}
                placeholder="E.g., 501(c)(3) documentation could not be validated with the national charity register."
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
                onClick={() => setRejectingOrg(null)}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmReject}
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
