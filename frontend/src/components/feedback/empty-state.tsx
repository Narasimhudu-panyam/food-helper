import React from "react";
import { Inbox } from "lucide-react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps["variant"];
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center",
        className
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
        {icon || <Inbox className="h-6 w-6 text-zinc-400" />}
      </div>
      <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
      <p className="mt-1 max-w-sm text-xs text-zinc-500 leading-normal">
        {description}
      </p>
      {action && (
        <div className="mt-4">
          <Button
            size="sm"
            variant={action.variant || "primary"}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
