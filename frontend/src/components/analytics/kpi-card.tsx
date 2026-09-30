import React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: "emerald" | "sky" | "amber" | "indigo" | "zinc";
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  variant = "emerald",
  className,
}: KpiCardProps) {
  const iconColorStyles = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    sky: "bg-sky-50 text-sky-600 border-sky-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-200",
    zinc: "bg-zinc-100 text-zinc-600 border-zinc-200",
  }[variant];

  return (
    <Card className={cn("p-5 flex flex-col justify-between transition-all hover:border-zinc-300 shadow-2xs", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </span>
        {icon && (
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border text-sm", iconColorStyles)}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-zinc-900">
          {value}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-zinc-500 font-normal">
            {subtitle}
          </p>
        )}
      </div>
    </Card>
  );
}
