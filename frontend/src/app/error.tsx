"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client boundary error for diagnostics without rendering raw stacks
    console.error("Application root error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 border border-rose-200">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-zinc-900">
        Something went wrong
      </h1>
      <p className="mt-1.5 max-w-sm text-xs text-zinc-500 leading-relaxed">
        An unexpected error occurred while loading this view. You can attempt to retry or return to your workspace.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          size="md"
          variant="primary"
          onClick={() => reset()}
          leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
        >
          Try Again
        </Button>
        <Link href="/app">
          <Button size="md" variant="outline" leftIcon={<Home className="h-3.5 w-3.5 mr-1" />}>
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
