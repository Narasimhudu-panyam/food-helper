import { apiClient } from "@/lib/api/client";
import {
  DonationMatch,
  MatchAcceptRequest,
  MatchDeclineRequest,
} from "@/types";

export const matchesApi = {
  getMatch: async (matchId: string): Promise<DonationMatch> => {
    return await apiClient.get<DonationMatch>(`/matches/${matchId}`);
  },

  acceptMatch: async (
    matchId: string,
    data: MatchAcceptRequest
  ): Promise<DonationMatch> => {
    return await apiClient.post<DonationMatch>(`/matches/${matchId}/accept`, data);
  },

  declineMatch: async (
    matchId: string,
    data: MatchDeclineRequest
  ): Promise<DonationMatch> => {
    return await apiClient.post<DonationMatch>(`/matches/${matchId}/decline`, data);
  },
};
