"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function WorkspaceErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Workspace error boundary caught error:", error);
  }, [error]);

  return (
    <PageContainer>
      <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
        <Card className="max-w-md w-full border-rose-200 bg-rose-50/30">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-zinc-900">
              Unable to load this workspace view
            </h3>
            <p className="mt-1.5 text-xs text-zinc-600 leading-relaxed">
              We encountered an issue loading this section. Your authenticated session is active and data is safe.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="sm"
                variant="primary"
                onClick={() => reset()}
                leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
              >
                Try Again
              </Button>
              <Link href="/app">
                <Button size="sm" variant="outline">
                  Go to Overview
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
