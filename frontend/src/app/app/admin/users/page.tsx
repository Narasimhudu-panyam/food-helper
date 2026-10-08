"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  HeartHandshake,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { UserRole } from "@/types";

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const isActiveParam =
    statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined;

  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminUsers({
    role: roleFilter === "ALL" ? undefined : roleFilter,
    is_active: isActiveParam,
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

  // Metric stats
  const totalUsers = users.length;
  const businessUsers = users.filter((u) => u.role === "FOOD_BUSINESS").length;
  const orgUsers = users.filter((u) => u.role === "ORGANIZATION").length;
  const volunteerUsers = users.filter((u) => u.role === "VOLUNTEER").length;
  const inactiveUsers = users.filter((u) => !u.is_active).length;

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "FOOD_BUSINESS":
        return (
          <Badge variant="warning" size="sm">
            <Building2 className="mr-1 h-3 w-3" />
            Food Business
          </Badge>
        );

      case "ORGANIZATION":
        return (
          <Badge variant="success" size="sm">
            <HeartHandshake className="mr-1 h-3 w-3" />
            Relief Org
          </Badge>
        );
      case "VOLUNTEER":
        return (
          <Badge variant="info" size="sm">
            <UserIcon className="mr-1 h-3 w-3" />
            Volunteer
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge variant="secondary" size="sm">
            <Shield className="mr-1 h-3 w-3" />
            Administrator
          </Badge>
        );
      default:
        return <Badge variant="secondary" size="sm">{role}</Badge>;
    }
  };

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <PageContainer>
        <PageHeader
          title="Platform User Management"
          description="View, filter, inspect, and manage authorization status for all registered platform accounts."
          badge={
            <Badge variant="secondary" size="sm">
              <Users className="mr-1 h-3.5 w-3.5 text-zinc-600" />
              User Directory
            </Badge>
          }
        />

        {/* Quick Stats Metric Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Total Accounts
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{totalUsers}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Food Businesses
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{businessUsers}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Organizations
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{orgUsers}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              Volunteers
            </p>
            <p className="mt-1 text-2xl font-bold text-indigo-700">{volunteerUsers}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">
              Deactivated
            </p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{inactiveUsers}</p>
          </Card>
        </div>

        {/* Filter and Search Bar */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Role Filters */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { label: "All Roles", value: "ALL" },
                    { label: "Businesses", value: "FOOD_BUSINESS" },
                    { label: "Organizations", value: "ORGANIZATION" },
                    { label: "Volunteers", value: "VOLUNTEER" },
                    { label: "Admins", value: "ADMIN" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setRoleFilter(tab.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      roleFilter === tab.value
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-zinc-200 hidden sm:block" />

              {/* Status Filters */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { label: "All Status", value: "ALL" },
                    { label: "Active", value: "ACTIVE" },
                    { label: "Inactive", value: "INACTIVE" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      statusFilter === tab.value
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "bg-zinc-50 text-zinc-600 hover:bg-zinc-150 border border-zinc-200 hover:text-zinc-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Search email or name..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </Card>

        {/* User Directory Table */}
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
            title="Failed to Load Users"
            message={error?.message || "Could not retrieve the user list from the database."}
            onRetry={refetch}
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6 text-zinc-400" />}
            title="No Users Found"
            description="No registered user accounts matched your search and filter criteria."
            action={
              roleFilter !== "ALL" || statusFilter !== "ALL" || searchQuery
                ? {
                    label: "Reset Filters",
                    onClick: () => {
                      setRoleFilter("ALL");
                      setStatusFilter("ALL");
                      setSearchQuery("");
                      setDebouncedSearch("");
                    },
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
                      Account & Identity
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Role
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Account Status
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Email Verification
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Registered
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/75 transition-colors">
                      {/* Identity & Email */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold text-xs ${
                              u.role === "ADMIN"
                                ? "bg-purple-100 text-purple-700"
                                : u.role === "FOOD_BUSINESS"
                                ? "bg-blue-100 text-blue-700"
                                : u.role === "ORGANIZATION"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-indigo-100 text-indigo-700"
                            }`}
                          >
                            {u.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              href={`/app/admin/users/${u.id}`}
                              className="font-semibold text-zinc-900 hover:text-blue-600 hover:underline"
                            >
                              {u.display_name || u.email}
                            </Link>
                            {u.display_name && (
                              <p className="text-[11px] text-zinc-500 font-mono">{u.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-4">{getRoleBadge(u.role)}</td>

                      {/* Active Status */}
                      <td className="px-4 py-4">
                        {u.is_active ? (
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
                      </td>

                      {/* Email Verification */}
                      <td className="px-4 py-4">
                        {u.is_verified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-400 font-normal text-xs">
                            Unverified
                          </span>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="px-4 py-4 text-zinc-500 whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <Link href={`/app/admin/users/${u.id}`}>
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
