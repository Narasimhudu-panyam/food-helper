import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { donationsApi, ListDonationsParams } from "@/lib/api/donations";
import {
  DonationCancelRequest,
  DonationCreate,
  DonationUpdate,
} from "@/types";

export const DONATIONS_QUERY_KEY = ["donations"];
export const donationDetailQueryKey = (id: string) => ["donations", id];

export function useDonations(params?: ListDonationsParams) {
  return useQuery({
    queryKey: [...DONATIONS_QUERY_KEY, params],
    queryFn: () => donationsApi.listDonations(params),
  });
}

export function useDonation(donationId?: string | null) {
  return useQuery({
    queryKey: donationDetailQueryKey(donationId || ""),
    queryFn: () => donationsApi.getDonation(donationId!),
    enabled: Boolean(donationId),
  });
}

export function useCreateDonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DonationCreate) => donationsApi.createDonation(data),
    onSuccess: (newDonation) => {
      queryClient.invalidateQueries({ queryKey: DONATIONS_QUERY_KEY });
      queryClient.setQueryData(donationDetailQueryKey(newDonation.id), newDonation);
    },
  });
}

export function useUpdateDonation(donationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DonationUpdate) =>
      donationsApi.updateDonation(donationId, data),
    onSuccess: (updatedDonation) => {
      queryClient.invalidateQueries({ queryKey: DONATIONS_QUERY_KEY });
      queryClient.setQueryData(donationDetailQueryKey(donationId), updatedDonation);
    },
  });
}

export function useCancelDonation(donationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DonationCancelRequest) =>
      donationsApi.cancelDonation(donationId, data),
    onSuccess: (cancelledDonation) => {
      queryClient.invalidateQueries({ queryKey: DONATIONS_QUERY_KEY });
      queryClient.setQueryData(donationDetailQueryKey(donationId), cancelledDonation);
    },
  });
}
