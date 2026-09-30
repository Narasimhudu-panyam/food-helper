import React from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  message?: string;
  description?: string;
  fullScreen?: boolean;
  className?: string;
}

export function LoadingState({
  message = "Loading...",
  description,
  fullScreen = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center",
        fullScreen ? "fixed inset-0 z-50 bg-white/90 backdrop-blur-xs" : "min-h-[220px] w-full",
        className
      )}
      role="status"
    >
      <Spinner size="lg" className="text-emerald-600 mb-3" />
      <h4 className="text-sm font-semibold text-zinc-900">{message}</h4>
      {description && (
        <p className="mt-1 max-w-xs text-xs text-zinc-500">{description}</p>
      )}
    </div>
  );
}
