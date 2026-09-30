"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types";

export interface AccessDeniedProps {
  currentRole?: UserRole;
  requiredRoles?: UserRole[];
  returnUrl?: string;
}

export function AccessDenied({
  currentRole,
  returnUrl = "/app",
}: AccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shadow-xs">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-bold tracking-tight text-zinc-900">
        Access Restricted
      </h2>
      <p className="mt-1.5 max-w-md text-xs text-zinc-500 leading-relaxed">
        You do not have authorization to access this role workspace.
        {currentRole && (
          <>
            {" "}Your active account role is{" "}
            <span className="font-semibold text-zinc-700 capitalize">
              {currentRole.toLowerCase().replace(/_/g, " ")}
            </span>
            .
          </>
        )}
      </p>
      <div className="mt-6">
        <Link href={returnUrl}>
          <Button size="md" variant="primary">
            Return to My Workspace
          </Button>
        </Link>
      </div>
    </div>
  );
}
