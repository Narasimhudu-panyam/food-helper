"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { NotificationCenter } from "@/components/notifications/notification-center";

export interface TopbarProps {
  onOpenMobileMenu: () => void;
}

export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  const role = user?.role || "FOOD_BUSINESS";
  const roleBadgeVariant = {
    FOOD_BUSINESS: "info",
    ORGANIZATION: "success",
    VOLUNTEER: "warning",
    ADMIN: "danger",
  }[role] as "info" | "success" | "warning" | "danger";

  // Compute breadcrumbs
  const getBreadcrumb = () => {
    if (pathname.startsWith("/app/business")) {
      return { section: "Food Business", page: "Overview" };
    }
    if (pathname.startsWith("/app/organization")) {
      return { section: "Organization", page: "Overview" };
    }
    if (pathname.startsWith("/app/volunteer")) {
      return { section: "Volunteer", page: "Overview" };
    }
    if (pathname.startsWith("/app/admin")) {
      return { section: "Operations", page: "Overview" };
    }
    return { section: "Workspace", page: "Overview" };
  };

  const breadcrumb = getBreadcrumb();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6">
      <div className="flex items-center space-x-3">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 md:hidden"
          aria-label="Open mobile navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Dynamic Workspace Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs">
          <span className="font-semibold text-zinc-400">Workspace</span>
          <span className="text-zinc-300">/</span>
          <span className="font-medium text-zinc-600">{breadcrumb.section}</span>
          <span className="text-zinc-300">/</span>
          <span className="font-semibold text-zinc-900">{breadcrumb.page}</span>
        </nav>
      </div>

      <div className="flex items-center space-x-3">
        {/* Notification Center */}
        <NotificationCenter />

        {/* User Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            className="flex items-center space-x-2 rounded-lg p-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
              <UserIcon className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline-block max-w-[150px] truncate text-zinc-800">
              {user?.email || "Account"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              aria-orientation="vertical"
              className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg z-50 animate-in fade-in slide-in-from-top-1"
            >
              {/* User summary header */}
              <div className="border-b border-zinc-100 px-3 py-2">
                <p className="truncate text-xs font-semibold text-zinc-900">
                  {user?.email}
                </p>
                <div className="mt-1">
                  <Badge size="sm" variant={roleBadgeVariant}>
                    {role.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              {/* Menu items */}
              <div className="pt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
