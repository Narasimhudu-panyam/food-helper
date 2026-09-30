import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessApi } from "@/lib/api/business";
import { FoodBusinessCreate, FoodBusinessUpdate } from "@/types";

export const BUSINESS_PROFILE_QUERY_KEY = ["business", "profile"];

export function useBusinessProfile() {
  return useQuery({
    queryKey: BUSINESS_PROFILE_QUERY_KEY,
    queryFn: () => businessApi.getProfile(),
  });
}

export function useCreateBusinessProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FoodBusinessCreate) => businessApi.createProfile(data),
    onSuccess: (newProfile) => {
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, newProfile);
    },
  });
}

export function useUpdateBusinessProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FoodBusinessUpdate) => businessApi.updateProfile(data),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(BUSINESS_PROFILE_QUERY_KEY, updatedProfile);
    },
  });
}
