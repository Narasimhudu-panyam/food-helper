import { apiClient } from "@/lib/api/client";
import {
  AdminOrganization,
  AdminOrganizationListParams,
  OrganizationRejectRequest,
} from "@/types";

export const adminOrganizationsApi = {
  list: async (params?: AdminOrganizationListParams): Promise<AdminOrganization[]> => {
    return await apiClient.get<AdminOrganization[]>("/admin/organizations", {
      params: {
        verification_status: params?.verification_status,
        search: params?.search,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
      },
    });
  },

  getById: async (id: string): Promise<AdminOrganization> => {
    return await apiClient.get<AdminOrganization>(`/admin/organizations/${id}`);
  },

  verify: async (id: string): Promise<AdminOrganization> => {
    return await apiClient.post<AdminOrganization>(`/admin/organizations/${id}/verify`);
  },

  reject: async (id: string, reason: string): Promise<AdminOrganization> => {
    const payload: OrganizationRejectRequest = { reason };
    return await apiClient.post<AdminOrganization>(`/admin/organizations/${id}/reject`, payload);
  },
};
