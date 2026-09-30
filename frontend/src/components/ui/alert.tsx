import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  onDismiss?: () => void;
}

export function Alert({
  className,
  variant = "info",
  title,
  children,
  onDismiss,
  ...props
}: AlertProps) {
  const variantConfig = {
    info: {
      container: "bg-sky-50 border-sky-200 text-sky-900",
      icon: <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />,
      titleColor: "text-sky-900",
    },
    success: {
      container: "bg-emerald-50 border-emerald-200 text-emerald-900",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />,
      titleColor: "text-emerald-900",
    },
    warning: {
      container: "bg-amber-50 border-amber-200 text-amber-900",
      icon: <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />,
      titleColor: "text-amber-900",
    },
    error: {
      container: "bg-rose-50 border-rose-200 text-rose-900",
      icon: <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />,
      titleColor: "text-rose-900",
    },
  };

  const config = variantConfig[variant];

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start justify-between rounded-lg border p-3.5 text-xs transition-colors",
        config.container,
        className
      )}
      {...props}
    >
      <div className="flex items-start space-x-2.5">
        {config.icon}
        <div className="space-y-0.5">
          {title && (
            <h5 className={cn("font-semibold leading-tight", config.titleColor)}>
              {title}
            </h5>
          )}
          <div className="leading-normal opacity-90">{children}</div>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-3 rounded p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          aria-label="Dismiss alert"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
