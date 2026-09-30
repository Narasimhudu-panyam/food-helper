import { apiClient } from "@/lib/api/client";
import {
  Donation,
  DonationCancelRequest,
  DonationCreate,
  DonationMatch,
  DonationMatchListResponse,
  DonationStatus,
  DonationUpdate,
  MatchOfferCreate,
} from "@/types";

export interface ListDonationsParams {
  status?: DonationStatus;
  limit?: number;
  offset?: number;
}

export const donationsApi = {
  listDonations: async (params?: ListDonationsParams): Promise<Donation[]> => {
    return await apiClient.get<Donation[]>("/donations", {
      params: {
        status: params?.status,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
      },
    });
  },

  getDonation: async (donationId: string): Promise<Donation> => {
    return await apiClient.get<Donation>(`/donations/${donationId}`);
  },

  createDonation: async (data: DonationCreate): Promise<Donation> => {
    return await apiClient.post<Donation>("/donations", data);
  },

  updateDonation: async (
    donationId: string,
    data: DonationUpdate
  ): Promise<Donation> => {
    return await apiClient.patch<Donation>(`/donations/${donationId}`, data);
  },

  cancelDonation: async (
    donationId: string,
    data: DonationCancelRequest
  ): Promise<Donation> => {
    return await apiClient.post<Donation>(`/donations/${donationId}/cancel`, data);
  },

  getDonationMatches: async (
    donationId: string,
    maxRadiusKm?: number
  ): Promise<DonationMatchListResponse> => {
    return await apiClient.get<DonationMatchListResponse>(
      `/donations/${donationId}/matches`,
      {
        params: {
          max_radius_km: maxRadiusKm ?? 25.0,
        },
      }
    );
  },

  createMatchOffer: async (
    donationId: string,
    data: MatchOfferCreate
  ): Promise<DonationMatch> => {
    return await apiClient.post<DonationMatch>(
      `/donations/${donationId}/matches`,
      data
    );
  },

  listDonationMatchOffers: async (
    donationId: string
  ): Promise<DonationMatch[]> => {
    return await apiClient.get<DonationMatch[]>(
      `/donations/${donationId}/offers`
    );
  },
};
