"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  HeartHandshake,
  Info,
  Layers,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { getNotificationDeepLink } from "@/lib/notifications/notification-routing";
import { Notification, NotificationType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "MATCH_INVITATION":
    case "MATCH_ACCEPTED":
    case "MATCH_DECLINED":
      return <HeartHandshake className="h-4 w-4 text-sky-600" />;
    case "PICKUP_ASSIGNED":
    case "PICKUP_STATUS_UPDATE":
      return <Truck className="h-4 w-4 text-amber-600" />;
    case "DONATION_DELIVERED":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "DONATION_CANCELLED":
      return <AlertCircle className="h-4 w-4 text-rose-600" />;
    case "VERIFICATION_STATUS_CHANGED":
      return <ShieldCheck className="h-4 w-4 text-purple-600" />;
    case "SYSTEM_ALERT":
    default:
      return <Info className="h-4 w-4 text-zinc-600" />;
  }
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSecs < 60) return "Just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useAuth();

  const { data: unreadData } = useUnreadNotificationCount(Boolean(user));
  const {
    data: notificationsData,
    isLoading,
    isError,
    refetch,
  } = useNotifications({ limit: 10 });

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const unreadCount = unreadData?.unread_count ?? 0;
  const notifications = notificationsData?.items ?? [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }

    const deepLink = getNotificationDeepLink(notification, user?.role);
    if (deepLink) {
      setIsOpen(false);
      router.push(deepLink);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
    } catch (err) {
      console.warn("Failed to mark all as read:", err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button with Badge */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        className="relative rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Center"
          className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 rounded-xl border border-zinc-200 bg-white shadow-xl z-50 animate-in fade-in slide-in-from-top-1 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 bg-zinc-50/70">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-zinc-900">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
                className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 focus:outline-none disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List Area */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-zinc-100">
            {isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : isError ? (
              <div className="p-6 text-center">
                <p className="text-xs text-rose-600 font-medium">
                  Failed to load notifications.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                  className="mt-2 text-xs h-7"
                  leftIcon={<RotateCcw className="h-3 w-3 mr-1" />}
                >
                  Retry
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 mb-2">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-800">
                  No notifications yet
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  We'll notify you when matches, pickups, or account updates occur.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const deepLink = getNotificationDeepLink(n, user?.role);

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left p-3.5 flex items-start space-x-3 transition-colors hover:bg-zinc-50/80 focus:outline-none focus:bg-zinc-50 ${
                      !n.is_read ? "bg-emerald-50/20" : ""
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 border border-zinc-200/60 mt-0.5">
                      {getNotificationIcon(n.notification_type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`truncate text-xs ${
                            !n.is_read
                              ? "font-bold text-zinc-900"
                              : "font-medium text-zinc-700"
                          }`}
                        >
                          {n.title}
                        </p>
                        <span className="text-[10px] text-zinc-400 shrink-0">
                          {formatRelativeTime(n.created_at)}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-600 line-clamp-2 mt-0.5 leading-snug">
                        {n.message}
                      </p>

                      {deepLink && (
                        <span className="inline-flex items-center text-[10px] text-emerald-600 font-medium mt-1 hover:underline">
                          View details <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                        </span>
                      )}
                    </div>

                    {!n.is_read && (
                      <span
                        className="h-2 w-2 rounded-full bg-emerald-600 shrink-0 mt-1.5"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-100 p-2.5 bg-zinc-50/50 text-center">
            <Link
              href="/app/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
