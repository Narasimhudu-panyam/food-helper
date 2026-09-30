"use client";

import React from "react";
import { TimeRangePreset } from "@/types";
import { cn } from "@/lib/utils";

export interface TimeRangeSelectorProps {
  value: TimeRangePreset;
  onChange: (preset: TimeRangePreset) => void;
  disabled?: boolean;
  className?: string;
}

const PRESETS: { label: string; value: TimeRangePreset }[] = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
  { label: "All Time", value: "all" },
];

export function TimeRangeSelector({
  value,
  onChange,
  disabled = false,
  className,
}: TimeRangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Time range selector"
      className={cn(
        "inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100/80 p-1 text-xs font-medium",
        className
      )}
    >
      {PRESETS.map((preset) => {
        const isSelected = value === preset.value;
        return (
          <button
            key={preset.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.value)}
            className={cn(
              "rounded-md px-3 py-1.5 transition-all text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
              isSelected
                ? "bg-white text-zinc-900 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
