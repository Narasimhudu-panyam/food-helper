import { UserRole } from "@/types";
import {
  Building2,
  CalendarCheck,
  ClipboardList,
  HeartHandshake,
  Home,
  Layers,
  MapPin,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const ROLE_WORKSPACE_ROOTS: Record<UserRole, string> = {
  FOOD_BUSINESS: "/app/business",
  ORGANIZATION: "/app/organization",
  VOLUNTEER: "/app/volunteer",
  ADMIN: "/app/admin",
};

export const ROLE_NAVIGATION: Record<UserRole, NavSection[]> = {
  FOOD_BUSINESS: [
    {
      title: "Workspace",
      items: [
        { title: "Overview", href: "/app/business", icon: Home },
        { title: "Donations", href: "/app/business/donations", icon: Layers },
        { title: "Pickups", href: "/app/business/pickups", icon: Truck },
        { title: "Profile", href: "/app/business/profile", icon: Building2 },
      ],
    },
  ],
  ORGANIZATION: [
    {
      title: "Workspace",
      items: [
        { title: "Overview", href: "/app/organization", icon: Home },
        { title: "Matches", href: "/app/organization/matches", icon: HeartHandshake },
        { title: "Pickups", href: "/app/organization/pickups", icon: Truck },
        { title: "Capacity", href: "/app/organization/capacity", icon: Layers },
        { title: "Profile", href: "/app/organization/profile", icon: Building2 },
      ],
    },
  ],
  VOLUNTEER: [
    {
      title: "Workspace",
      items: [
        { title: "Overview", href: "/app/volunteer", icon: Home },
        { title: "Available Pickups", href: "/app/volunteer/available", icon: MapPin },
        { title: "My Pickups", href: "/app/volunteer/pickups", icon: CalendarCheck },
        { title: "Profile", href: "/app/volunteer/profile", icon: Users },
      ],
    },
  ],
  ADMIN: [
    {
      title: "Administration",
      items: [
        { title: "Operations Overview", href: "/app/admin", icon: Home },
        { title: "Verification Queue", href: "/app/admin/verifications", icon: ShieldCheck },
        { title: "All Organizations", href: "/app/admin/organizations", icon: Building2 },
        { title: "All Users", href: "/app/admin/users", icon: Users, disabled: true, badge: "Next" },
      ],
    },
  ],
};
