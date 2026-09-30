"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_WORKSPACE_ROOTS } from "@/components/layout/navigation-config";
import { LoadingState } from "@/components/feedback/loading-state";

export default function RoleLandingPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && user) {
        const targetRoute = ROLE_WORKSPACE_ROOTS[user.role] || "/app/business";
        router.replace(targetRoute);
      } else {
        router.replace("/login");
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <LoadingState
      message="Opening your workspace..."
      description="Routing to your role-specific dashboard"
      className="min-h-[70vh]"
    />
  );
}
