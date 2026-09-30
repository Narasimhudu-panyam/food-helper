"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global root layout error caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-center font-sans text-zinc-900">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 border border-rose-200">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">
          System Encountered an Error
        </h1>
        <p className="mt-1.5 max-w-sm text-xs text-zinc-500 leading-relaxed">
          An unrecoverable system exception occurred. Click below to reload the session.
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
