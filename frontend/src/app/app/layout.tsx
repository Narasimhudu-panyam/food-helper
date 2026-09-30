"use client";

import React from "react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
