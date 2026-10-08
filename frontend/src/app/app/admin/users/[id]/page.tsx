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
  HeartHandshake,
  Mail,
  MapPin,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Truck,
  User as UserIcon,
  UserCheck,
  UserX,
  Users,
  XCircle,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useAuth } from "@/lib/auth/auth-context";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  useAdminUser,
  useActivateUser,
  useDeactivateUser,
} from "@/hooks/use-admin-users";
import { UserRole } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminUserDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;

  const { user: currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [isActivateDialogOpen, setIsActivateDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);

  const {
    data: targetUser,
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminUser(userId);

  const activateMutation = useActivateUser();
  const deactivateMutation = useDeactivateUser();

  const isSelf = Boolean(currentUser && targetUser && currentUser.id === targetUser.id);

  const handleActivate = async () => {
    if (!targetUser) return;
    try {
      await activateMutation.mutateAsync(targetUser.id);
      success(`Account '${targetUser.email}' has been reactivated successfully.`);
      setIsActivateDialogOpen(false);
    } catch (err: any) {
      toastError(err?.message || "Failed to activate user account.");
    }
  };

  const handleDeactivate = async () => {
    if (!targetUser) return;
    if (isSelf) {
      toastError("Cannot deactivate your own administrator account.");
      return;
    }
    try {
      await deactivateMutation.mutateAsync(targetUser.id);
      success(`Account '${targetUser.email}' has been deactivated. Platform access is now revoked.`);
      setIsDeactivateDialogOpen(false);
    } catch (err: any) {
      toastError(err?.message || "Failed to deactivate user account.");
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "FOOD_BUSINESS":
        return (
          <Badge variant="warning" size="md">
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Food Business
          </Badge>
        );

      case "ORGANIZATION":
        return (
          <Badge variant="success" size="md">
            <HeartHandshake className="mr-1.5 h-3.5 w-3.5" />
            Relief Organization
          </Badge>
        );
      case "VOLUNTEER":
        return (
          <Badge variant="info" size="md">
            <UserIcon className="mr-1.5 h-3.5 w-3.5" />
            Volunteer
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge variant="secondary" size="md">
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Administrator
          </Badge>
        );
      default:
        return <Badge variant="secondary" size="md">{role}</Badge>;
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

  if (isError || !targetUser) {
    return (
      <AuthGuard allowedRoles={["ADMIN"]}>
        <PageContainer>
          <ErrorState
            title="User Account Not Found"
            message={error?.message || "The requested user account could not be found."}
            onRetry={refetch}
          />
        </PageContainer>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <PageContainer>
        {/* Breadcrumb Navigation */}
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-zinc-500">
          <Link href="/app/admin" className="hover:text-zinc-800">
            Admin
          </Link>
          <span>/</span>
          <Link href="/app/admin/users" className="hover:text-zinc-800">
            Users
          </Link>
          <span>/</span>
          <span className="text-zinc-900 font-semibold truncate max-w-xs">
            {targetUser.display_name || targetUser.email}
          </span>
        </div>

        {/* Page Header */}
        <PageHeader
          title={targetUser.display_name || targetUser.email}
          description={`Registered user account profile and authorization management.`}
          badge={
            <div className="flex items-center gap-2">
              {getRoleBadge(targetUser.role)}
              {targetUser.is_active ? (
                <Badge variant="success" size="sm">
                  <UserCheck className="mr-1 h-3 w-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="danger" size="sm">
                  <UserX className="mr-1 h-3 w-3" />
                  Deactivated
                </Badge>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-2.5">
              <Link href="/app/admin/users">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back to Directory
                </Button>
              </Link>

              {targetUser.is_active ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isSelf}
                  onClick={() => setIsDeactivateDialogOpen(true)}
                  title={isSelf ? "You cannot deactivate your own account" : undefined}
                >
                  <UserX className="mr-1.5 h-4 w-4" />
                  Deactivate Account
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsActivateDialogOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <UserCheck className="mr-1.5 h-4 w-4" />
                  Reactivate Account
                </Button>
              )}
            </div>
          }
        />

        {/* Self Account Alert Notice if viewing own profile */}
        {isSelf && (
          <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4 text-xs text-purple-900 flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-purple-600 shrink-0" />
            <span>
              <strong>Note:</strong> You are currently viewing your own active Administrator account. Self-deactivation is disabled for security and operational continuity.
            </span>
          </div>
        )}

        {/* Main Details Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column (2 Cols): Core Account & Domain Profile */}
          <div className="space-y-6 lg:col-span-2">
            {/* Core Account Details Card */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-blue-600" />
                  Account & Authentication Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Email Address</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-zinc-400" />
                      {targetUser.email}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Platform Role</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-800">
                      {targetUser.role.replace(/_/g, " ")}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">Account Status</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant={targetUser.is_active ? "success" : "danger"} size="sm">
                        {targetUser.is_active ? "Active" : "Deactivated"}
                      </Badge>
                      <span className="text-xs text-zinc-500">
                        {targetUser.is_active
                          ? "Authorized to access platform"
                          : "Blocked from API and login"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase">
                      Email Verification
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {targetUser.is_verified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-sm">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-sm">Unverified</span>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-zinc-500 uppercase">User ID</p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-600 bg-zinc-50 p-2 rounded border border-zinc-100 break-all">
                      {targetUser.id}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Role Profile Details */}
            {targetUser.role === "FOOD_BUSINESS" && (
              <Card>
                <CardHeader className="border-b border-zinc-100 pb-4">
                  <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-600" />
                    Food Business Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {targetUser.business_profile ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Business Name</p>
                        <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                          {targetUser.business_profile.business_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Business Type</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-800">
                          {targetUser.business_profile.business_type}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Contact Phone</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-zinc-400" />
                          {targetUser.business_profile.contact_phone}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Address</p>
                        <p className="mt-0.5 text-sm text-zinc-800 flex items-start gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                          {targetUser.business_profile.address_text}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      This user has not yet completed their Food Business onboarding profile.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {targetUser.role === "ORGANIZATION" && (
              <Card>
                <CardHeader className="border-b border-zinc-100 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                      <HeartHandshake className="h-4 w-4 text-emerald-600" />
                      Relief Organization Profile
                    </CardTitle>
                    {targetUser.organization_profile && (
                      <Link
                        href={`/app/admin/organizations/${targetUser.organization_profile.id}`}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                      >
                        Inspect Full Facility <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {targetUser.organization_profile ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Organization Name</p>
                        <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                          {targetUser.organization_profile.org_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Facility Type</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-800">
                          {targetUser.organization_profile.org_type.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Verification Status</p>
                        <div className="mt-0.5">
                          <StatusBadge
                            status={targetUser.organization_profile.verification_status}
                            size="sm"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Contact Phone</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-zinc-400" />
                          {targetUser.organization_profile.contact_phone}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Street Address</p>
                        <p className="mt-0.5 text-sm text-zinc-800 flex items-start gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                          {targetUser.organization_profile.address_text}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      This user has not yet completed their Relief Organization profile.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {targetUser.role === "VOLUNTEER" && (
              <Card>
                <CardHeader className="border-b border-zinc-100 pb-4">
                  <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-indigo-600" />
                    Volunteer Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {targetUser.volunteer_profile ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Full Name</p>
                        <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                          {targetUser.volunteer_profile.full_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Vehicle Type</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-800">
                          {targetUser.volunteer_profile.vehicle_type.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Contact Phone</p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-zinc-400" />
                          {targetUser.volunteer_profile.contact_phone}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase">Dispatch Availability</p>
                        <div className="mt-0.5">
                          <Badge
                            variant={targetUser.volunteer_profile.is_available ? "success" : "secondary"}
                            size="sm"
                          >
                            {targetUser.volunteer_profile.is_available ? "Available" : "Unavailable"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      This user has not yet completed their Volunteer onboarding profile.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {targetUser.role === "ADMIN" && (
              <Card>
                <CardHeader className="border-b border-zinc-100 pb-4">
                  <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-purple-600" />
                    Platform Administrator Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    This account holds full authoritative administrative rights across the Food Helper platform, including organization verification, user status moderation, analytics telemetry, and emergency dispatch overrides.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column (1 Col): Security Status & Timestamps */}
          <div className="space-y-6">
            {/* Status Control Card */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-zinc-600" />
                  Account Authorization
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                  <p className="font-semibold text-zinc-800 mb-1">Authorization Enforcement</p>
                  <p>
                    When deactivated, all active sessions and subsequent API requests from this user are immediately rejected by the authoritative backend RBAC layer.
                  </p>
                </div>

                {targetUser.is_active ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={isSelf}
                    onClick={() => setIsDeactivateDialogOpen(true)}
                  >
                    <UserX className="mr-1.5 h-4 w-4" />
                    {isSelf ? "Self-Deactivation Disabled" : "Deactivate User Account"}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setIsActivateDialogOpen(true)}
                  >
                    <UserCheck className="mr-1.5 h-4 w-4" />
                    Reactivate User Account
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Audit Timestamps Card */}
            <Card>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-600" />
                  System Audit Record
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs text-zinc-600">
                <div>
                  <p className="font-semibold text-zinc-700">Registration Date</p>
                  <p className="text-zinc-800 font-medium">
                    {new Date(targetUser.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-700">Last Profile Update</p>
                  <p className="text-zinc-800 font-medium">
                    {new Date(targetUser.updated_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-700">Database Role Claim</p>
                  <p className="font-mono text-zinc-800 font-semibold">{targetUser.role}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Activate Confirmation Modal */}
        <ConfirmDialog
          isOpen={isActivateDialogOpen}
          onClose={() => setIsActivateDialogOpen(false)}
          onConfirm={handleActivate}
          title="Confirm Account Activation"
          description={`Activate account for '${targetUser.email}'? The user will immediately regain access to the platform.`}
          confirmText="Reactivate Account"
          cancelText="Cancel"
          variant="primary"
          isLoading={activateMutation.isPending}
        />

        {/* Deactivate Confirmation Modal */}
        <ConfirmDialog
          isOpen={isDeactivateDialogOpen}
          onClose={() => setIsDeactivateDialogOpen(false)}
          onConfirm={handleDeactivate}
          title="Confirm Account Deactivation"
          description={`Deactivate account for '${targetUser.email}'? The user will be immediately blocked from signing in and all active API sessions will be rejected.`}
          confirmText="Deactivate Account"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deactivateMutation.isPending}
        />

      </PageContainer>
    </AuthGuard>
  );
}
