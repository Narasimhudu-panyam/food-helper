import { apiClient } from "@/lib/api/client";
import {
  DonationMatch,
  MatchStatus,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/types";

export interface ListMatchesParams {
  status?: MatchStatus;
  limit?: number;
  offset?: number;
}

export const organizationsApi = {
  getProfile: async (): Promise<Organization | null> => {
    try {
      return await apiClient.get<Organization>("/organizations/profile");
    } catch (err: any) {
      if (err?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  createProfile: async (data: OrganizationCreate): Promise<Organization> => {
    return await apiClient.post<Organization>("/organizations/profile", data);
  },

  updateProfile: async (data: OrganizationUpdate): Promise<Organization> => {
    return await apiClient.patch<Organization>("/organizations/profile", data);
  },

  listIncomingMatches: async (
    params?: ListMatchesParams
  ): Promise<DonationMatch[]> => {
    return await apiClient.get<DonationMatch[]>("/organizations/matches", {
      params: {
        status: params?.status,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
      },
    });
  },
};
