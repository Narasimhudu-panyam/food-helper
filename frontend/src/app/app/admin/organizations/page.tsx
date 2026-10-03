"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  MapPin,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
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
import { useAdminOrganizations } from "@/hooks/use-admin-organizations";
import { OrgVerificationStatus } from "@/types";

export default function AdminAllOrganizationsPage() {
  const [statusFilter, setStatusFilter] = useState<OrgVerificationStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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
    const timer = setTimeout(() => {
      setDebouncedSearch(val.trim());
    }, 300);
    return () => clearTimeout(timer);
  };

  // Summary Metrics calculations
  const totalCount = organizations.length;
  const verifiedCount = organizations.filter((o) => o.verification_status === "VERIFIED").length;
  const pendingCount = organizations.filter((o) => o.verification_status === "PENDING").length;
  const totalCapacityKg = organizations.reduce((acc, o) => acc + Number(o.max_capacity_kg || 0), 0);

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <PageContainer>
        <PageHeader
          title="All Relief Organizations"
          description="Comprehensive directory of registered shelters, food banks, soup kitchens, and community pantries across the network."
          badge={
            <Badge variant="secondary" size="sm">
              <Building2 className="mr-1 h-3.5 w-3.5 text-zinc-600" />
              Directory
            </Badge>
          }
          actions={
            <Link href="/app/admin/verifications">
              <Button variant="primary" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Verification Queue ({pendingCount})
              </Button>
            </Link>
          }
        />

        {/* Quick Stats Metric Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Total Organizations
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{totalCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Verified & Active
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{verifiedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              Pending Review
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{pendingCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Combined Capacity
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">
              {totalCapacityKg.toLocaleString()} <span className="text-sm font-medium">kg</span>
            </p>
          </Card>
        </div>

        {/* Filter and Search Bar */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { label: "All Organizations", value: "ALL" },
                  { label: "Pending", value: "PENDING" },
                  { label: "Verified", value: "VERIFIED" },
                  { label: "Rejected", value: "REJECTED" },
                  { label: "Suspended", value: "SUSPENDED" },
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

        {/* Directory Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="Failed to Load Organizations"
            message={error?.message || "Could not retrieve the organization directory from the database."}
            onRetry={refetch}
          />
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6 text-zinc-400" />}
            title="No Organizations Found"
            description="No registered organizations matched your filter criteria."
            action={
              statusFilter !== "ALL"
                ? {
                    label: "Clear Status Filter",
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
                      Facility Location
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Contact & Account
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Capacity
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Created
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Action
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
                            <p className="text-zinc-500 text-[11px]">
                              {org.org_type.replace(/_/g, " ")}
                              {org.tax_id && (
                                <span className="ml-1.5 font-mono text-[10px] text-zinc-400">
                                  ({org.tax_id})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Location Address */}
                      <td className="px-4 py-4 text-zinc-700 max-w-xs truncate">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{org.address_text}</span>
                        </div>
                      </td>

                      {/* Contact & Account */}
                      <td className="px-4 py-4">
                        <p className="text-zinc-900 font-medium">{org.owner_email || "N/A"}</p>
                        <p className="text-zinc-500 text-[11px] flex items-center gap-1">
                          <Phone className="h-3 w-3 text-zinc-400" />
                          {org.contact_phone}
                        </p>
                      </td>

                      {/* Capacity */}
                      <td className="px-4 py-4">
                        <p className="font-semibold text-zinc-800">
                          {Number(org.current_capacity_kg).toLocaleString()} /{" "}
                          {Number(org.max_capacity_kg).toLocaleString()} kg
                        </p>
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (Number(org.current_capacity_kg) /
                                    (Number(org.max_capacity_kg) || 1)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
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

                      {/* Action */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <Link href={`/app/admin/organizations/${org.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
