import { apiClient } from "@/lib/api/client";
import {
  Pickup,
  PickupAssignVolunteerRequest,
  PickupCancelRequest,
  PickupCreateRequest,
  PickupFailRequest,
  PickupStatus,
  PickupVerifyDeliveryRequest,
  PickupVolunteerMatchListResponse,
} from "@/types";

export interface ListPickupsParams {
  status?: PickupStatus;
  limit?: number;
  offset?: number;
}

export const pickupsApi = {
  listPickups: async (params?: ListPickupsParams): Promise<Pickup[]> => {
    return await apiClient.get<Pickup[]>("/pickups", {
      params: {
        status: params?.status,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
      },
    });
  },

  getPickup: async (pickupId: string): Promise<Pickup> => {
    return await apiClient.get<Pickup>(`/pickups/${pickupId}`);
  },

  createPickupForMatch: async (
    matchId: string,
    data: PickupCreateRequest
  ): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/matches/${matchId}/pickup`, data);
  },

  startPickup: async (pickupId: string): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/pickups/${pickupId}/start`);
  },

  completePickup: async (
    pickupId: string,
    data?: PickupVerifyDeliveryRequest
  ): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/pickups/${pickupId}/complete`, data);
  },

  failPickup: async (
    pickupId: string,
    data: PickupFailRequest
  ): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/pickups/${pickupId}/fail`, data);
  },

  cancelPickup: async (
    pickupId: string,
    data: PickupCancelRequest
  ): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/pickups/${pickupId}/cancel`, data);
  },

  getEligibleVolunteers: async (
    pickupId: string
  ): Promise<PickupVolunteerMatchListResponse> => {
    return await apiClient.get<PickupVolunteerMatchListResponse>(
      `/pickups/${pickupId}/volunteers`
    );
  },

  assignVolunteer: async (
    pickupId: string,
    data?: PickupAssignVolunteerRequest
  ): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/pickups/${pickupId}/assign`, data);
  },

  releaseVolunteer: async (pickupId: string): Promise<Pickup> => {
    return await apiClient.post<Pickup>(`/pickups/${pickupId}/release`);
  },
};
