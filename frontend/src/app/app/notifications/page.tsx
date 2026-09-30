"use client";

import React, { useState } from "react";
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
  Filter,
  HeartHandshake,
  Info,
  Layers,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/use-notifications";
import { getNotificationDeepLink } from "@/lib/notifications/notification-routing";
import { Notification, NotificationType } from "@/types";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";

function getNotificationTypeBadge(type: NotificationType) {
  switch (type) {
    case "MATCH_INVITATION":
    case "MATCH_ACCEPTED":
    case "MATCH_DECLINED":
      return (
        <Badge variant="info" size="sm">
          {type.replace(/_/g, " ")}
        </Badge>
      );
    case "PICKUP_ASSIGNED":
    case "PICKUP_STATUS_UPDATE":
      return (
        <Badge variant="warning" size="sm">
          {type.replace(/_/g, " ")}
        </Badge>
      );
    case "DONATION_DELIVERED":
      return (
        <Badge variant="success" size="sm">
          DELIVERED
        </Badge>
      );
    case "DONATION_CANCELLED":
      return (
        <Badge variant="danger" size="sm">
          CANCELLED
        </Badge>
      );
    case "VERIFICATION_STATUS_CHANGED":
      return (
        <Badge variant="default" size="sm">
          VERIFICATION
        </Badge>
      );
    case "SYSTEM_ALERT":
    default:
      return (
        <Badge variant="default" size="sm">
          SYSTEM
        </Badge>
      );
  }
}

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const router = useRouter();
  const { user } = useAuth();

  const {
    data: notificationsData,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useNotifications({
    unread_only: unreadOnly ? true : undefined,
    limit: 50,
  });

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const notifications = notificationsData?.items ?? [];
  const unreadCount = notificationsData?.unread_count ?? 0;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }
    const deepLink = getNotificationDeepLink(notification, user?.role);
    if (deepLink) {
      router.push(deepLink);
    }
  };

  return (
    <AuthGuard>
      <PageContainer>
        <PageHeader
          title="Notifications"
          description="Updates about donations, matches, pickups, and account activity."
          actions={
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAllReadMutation.mutate()}
                  isLoading={markAllReadMutation.isPending}
                  leftIcon={<CheckCheck className="h-3.5 w-3.5 mr-1" />}
                >
                  Mark All as Read
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                isLoading={isFetching}
                leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Filter Tabs */}
        <div className="flex items-center space-x-2 border-b border-zinc-200 pb-3">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              !unreadOnly
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
            }`}
          >
            All Notifications ({notificationsData?.total ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              unreadOnly
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
            }`}
          >
            Unread Only ({unreadCount})
          </button>
        </div>

        {/* Notifications List Content */}
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="error" title="Unable to load notifications">
            Failed to retrieve notifications from the server.
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-3"
              leftIcon={<RotateCcw className="h-3.5 w-3.5 mr-1" />}
            >
              Try again
            </Button>
          </Alert>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-8 w-8 text-zinc-400" />}
            title="No notifications"
            description={
              unreadOnly
                ? "You have no unread notifications."
                : "You have no notifications in your activity log."
            }
          />
        ) : (
          <div className="space-y-2.5 pt-2">
            {notifications.map((n) => {
              const deepLink = getNotificationDeepLink(n, user?.role);

              return (
                <Card
                  key={n.id}
                  className={`transition-colors shadow-xs ${
                    !n.is_read
                      ? "bg-emerald-50/15 border-emerald-200 hover:border-emerald-300"
                      : "bg-white hover:border-zinc-300"
                  }`}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {!n.is_read && (
                          <span
                            className="h-2 w-2 rounded-full bg-emerald-600 shrink-0"
                            aria-label="Unread"
                          />
                        )}
                        <span className="text-xs font-bold text-zinc-900">
                          {n.title}
                        </span>
                        {getNotificationTypeBadge(n.notification_type)}
                      </div>

                      <p className="text-xs text-zinc-700 leading-relaxed">
                        {n.message}
                      </p>

                      <div className="flex items-center space-x-2 text-[11px] text-zinc-400 pt-0.5">
                        <Clock className="h-3 w-3 text-zinc-400" />
                        <span>{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 sm:self-center">
                      {!n.is_read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="h-8 text-xs"
                          leftIcon={<Check className="h-3 w-3 mr-1" />}
                        >
                          Mark read
                        </Button>
                      )}

                      {deepLink && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleNotificationClick(n)}
                          className="h-8 text-xs"
                          rightIcon={<ExternalLink className="h-3 w-3 ml-1" />}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AuthGuard>
  );
}
