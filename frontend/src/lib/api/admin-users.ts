import { apiClient } from "@/lib/api/client";
import {
  AdminUser,
  AdminUserDetail,
  AdminUserListParams,
} from "@/types";

export const adminUsersApi = {
  list: async (params?: AdminUserListParams): Promise<AdminUser[]> => {
    return await apiClient.get<AdminUser[]>("/admin/users", {
      params: {
        role: params?.role,
        is_active: params?.is_active,
        is_verified: params?.is_verified,
        search: params?.search,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
      },
    });
  },

  getById: async (id: string): Promise<AdminUserDetail> => {
    return await apiClient.get<AdminUserDetail>(`/admin/users/${id}`);
  },

  activate: async (id: string): Promise<AdminUser> => {
    return await apiClient.post<AdminUser>(`/admin/users/${id}/activate`);
  },

  deactivate: async (id: string): Promise<AdminUser> => {
    return await apiClient.post<AdminUser>(`/admin/users/${id}/deactivate`);
  },
};
