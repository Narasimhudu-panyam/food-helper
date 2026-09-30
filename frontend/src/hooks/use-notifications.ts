import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListNotificationsParams, notificationsApi } from "@/lib/api/notifications";
import { Notification } from "@/types";

export function useNotifications(params?: ListNotificationsParams) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => notificationsApi.listNotifications(params),
    staleTime: 1000 * 20, // 20 seconds fresh
  });
}

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => notificationsApi.getUnreadCount(),
    enabled,
    staleTime: 1000 * 15,
  });
}

export function useNotification(notificationId: string) {
  return useQuery({
    queryKey: ["notification", notificationId],
    queryFn: () => notificationsApi.getNotification(notificationId),
    enabled: Boolean(notificationId),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationsApi.markAsRead(notificationId),
    onSuccess: (updatedNotification: Notification) => {
      queryClient.setQueryData(
        ["notification", updatedNotification.id],
        updatedNotification
      );
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    },
  });
}
