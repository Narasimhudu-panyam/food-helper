import React from "react";
import { Badge, BadgeProps } from "./badge";
import {
  DonationStatus,
  MatchStatus,
  OrgVerificationStatus,
  PickupStatus,
} from "@/types";

type DomainStatus =
  | DonationStatus
  | MatchStatus
  | PickupStatus
  | OrgVerificationStatus
  | string;

export interface StatusBadgeProps {
  status: DomainStatus;
  size?: "sm" | "md";
  className?: string;
}

interface StatusConfig {
  label: string;
  variant: BadgeProps["variant"];
  dotColor?: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Donation Statuses
  DRAFT: { label: "Draft", variant: "secondary", dotColor: "bg-zinc-400" },
  CREATED: { label: "Available", variant: "info", dotColor: "bg-sky-500" },
  MATCHED: { label: "Matched", variant: "info", dotColor: "bg-sky-600" },
  ACCEPTED: { label: "Accepted", variant: "success", dotColor: "bg-emerald-500" },
  PICKUP_ASSIGNED: { label: "Pickup Assigned", variant: "info", dotColor: "bg-indigo-500" },
  IN_TRANSIT: { label: "In Transit", variant: "warning", dotColor: "bg-amber-500" },
  DELIVERED: { label: "Delivered", variant: "success", dotColor: "bg-emerald-600" },
  CANCELLED: { label: "Cancelled", variant: "secondary", dotColor: "bg-zinc-400" },
  EXPIRED: { label: "Expired", variant: "danger", dotColor: "bg-rose-500" },
  FAILED_DELIVERY: { label: "Failed Delivery", variant: "danger", dotColor: "bg-rose-600" },

  // Match Statuses
  PROPOSED: { label: "Proposed", variant: "secondary", dotColor: "bg-zinc-400" },
  INVITED: { label: "Invited", variant: "info", dotColor: "bg-sky-500" },
  DECLINED: { label: "Declined", variant: "secondary", dotColor: "bg-zinc-400" },
  REVOKED: { label: "Revoked", variant: "secondary", dotColor: "bg-zinc-400" },

  // Pickup Statuses
  ASSIGNED: { label: "Assigned", variant: "info", dotColor: "bg-sky-500" },
  EN_ROUTE_TO_PICKUP: { label: "En Route to Pickup", variant: "warning", dotColor: "bg-amber-500" },
  ARRIVED_AT_PICKUP: { label: "Arrived at Pickup", variant: "warning", dotColor: "bg-amber-600" },
  FAILED: { label: "Failed", variant: "danger", dotColor: "bg-rose-600" },

  // Verification Statuses
  PENDING: { label: "Pending Verification", variant: "warning", dotColor: "bg-amber-500" },
  VERIFIED: { label: "Verified", variant: "success", dotColor: "bg-emerald-600" },
  REJECTED: { label: "Rejected", variant: "danger", dotColor: "bg-rose-500" },
  SUSPENDED: { label: "Suspended", variant: "danger", dotColor: "bg-rose-700" },
};

export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const config: StatusConfig = STATUS_MAP[status] || {
    label: status.replace(/_/g, " "),
    variant: "default",
    dotColor: "bg-zinc-400",
  };

  return (
    <Badge variant={config.variant} size={size} className={className}>
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${config.dotColor}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </Badge>
  );
}
