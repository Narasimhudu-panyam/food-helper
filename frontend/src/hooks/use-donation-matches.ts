import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { donationsApi } from "@/lib/api/donations";
import { MatchOfferCreate } from "@/types";

export function useDonationMatchingCandidates(
  donationId: string,
  maxRadiusKm?: number,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["donation-matches", donationId, maxRadiusKm],
    queryFn: () => donationsApi.getDonationMatches(donationId, maxRadiusKm),
    enabled: Boolean(donationId) && enabled,
    staleTime: 1000 * 30, // 30s cache
  });
}

export function useDonationOffers(donationId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["donation-offers", donationId],
    queryFn: () => donationsApi.listDonationMatchOffers(donationId),
    enabled: Boolean(donationId) && enabled,
    staleTime: 1000 * 30,
  });
}

export function useCreateMatchOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      donationId,
      data,
    }: {
      donationId: string;
      data: MatchOfferCreate;
    }) => donationsApi.createMatchOffer(donationId, data),
    onSuccess: (newMatch, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["donation-matches", variables.donationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["donation-offers", variables.donationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["donation", variables.donationId],
      });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
    },
  });
}
