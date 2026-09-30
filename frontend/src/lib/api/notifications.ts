import { apiClient } from "@/lib/api/client";
import {
  BatchMarkReadResponse,
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from "@/types";

export interface ListNotificationsParams {
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}

export const notificationsApi = {
  listNotifications: async (
    params?: ListNotificationsParams
  ): Promise<NotificationListResponse> => {
    return await apiClient.get<NotificationListResponse>("/notifications", {
      params: {
        unread_only: params?.unread_only,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
      },
    });
  },

  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    return await apiClient.get<UnreadCountResponse>("/notifications/unread-count");
  },

  getNotification: async (notificationId: string): Promise<Notification> => {
    return await apiClient.get<Notification>(`/notifications/${notificationId}`);
  },

  markAsRead: async (notificationId: string): Promise<Notification> => {
    return await apiClient.post<Notification>(
      `/notifications/${notificationId}/read`
    );
  },

  markAllAsRead: async (): Promise<BatchMarkReadResponse> => {
    return await apiClient.post<BatchMarkReadResponse>("/notifications/read-all");
  },
};
