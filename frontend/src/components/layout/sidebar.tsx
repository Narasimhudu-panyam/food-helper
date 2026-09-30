"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Package2, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_NAVIGATION, ROLE_WORKSPACE_ROOTS } from "./navigation-config";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  onItemClick?: () => void;
  className?: string;
}

export function Sidebar({ onItemClick, className }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const role = user?.role || "FOOD_BUSINESS";
  const navSections = ROLE_NAVIGATION[role] || [];
  const workspaceRoot = ROLE_WORKSPACE_ROOTS[role] || "/app";

  const roleBadgeVariant = {
    FOOD_BUSINESS: "info",
    ORGANIZATION: "success",
    VOLUNTEER: "warning",
    ADMIN: "danger",
  }[role] as "info" | "success" | "warning" | "danger";

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col justify-between border-r border-zinc-200 bg-white select-none",
        className
      )}
    >
      {/* Top Header / Brand */}
      <div>
        <div className="flex h-16 items-center border-b border-zinc-200 px-6">
          <Link
            href={workspaceRoot}
            className="flex items-center space-x-2.5 font-bold tracking-tight text-zinc-900"
            onClick={onItemClick}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <Package2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm leading-none font-bold">FoodRescue</span>
              <span className="text-[10px] text-zinc-400 font-normal mt-0.5">Matcher Network</span>
            </div>
          </Link>
        </div>

        {/* Navigation Sections */}
        <div className="space-y-6 px-3 py-4 overflow-y-auto">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {section.title && (
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {section.title}
                </p>
              )}
              <nav className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/app" &&
                      item.href !== workspaceRoot &&
                      pathname.startsWith(item.href + "/"));

                  const IconComponent = item.icon;

                  if (item.disabled) {
                    return (
                      <div
                        key={item.href}
                        className="group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 cursor-not-allowed select-none opacity-60"
                        title="Coming in subsequent release stages"
                      >
                        <div className="flex items-center space-x-3">
                          <IconComponent className="h-4 w-4 shrink-0 text-zinc-300" />
                          <span>{item.title}</span>
                        </div>
                        {item.badge && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 border border-zinc-200/60">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onItemClick}
                      className={cn(
                        "group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-emerald-50 text-emerald-700 font-semibold"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <IconComponent
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-emerald-600"
                              : "text-zinc-400 group-hover:text-zinc-600"
                          )}
                        />
                        <span>{item.title}</span>
                      </div>
                      {item.badge && (
                        <Badge size="sm" variant="info">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>

      {/* User Section / Logout */}
      <div className="border-t border-zinc-200 p-4">
        <div className="mb-3 flex items-center justify-between rounded-lg bg-zinc-50 p-2.5 border border-zinc-200/60">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-xs font-medium text-zinc-900" title={user?.email}>
                {user?.email || "User"}
              </span>
              <div className="mt-0.5">
                <Badge size="sm" variant={roleBadgeVariant}>
                  {role.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center justify-center space-x-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <LogOut className="h-3.5 w-3.5 text-zinc-400" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
