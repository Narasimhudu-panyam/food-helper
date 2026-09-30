import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsApi } from "@/lib/api/organizations";
import { OrganizationCreate, OrganizationUpdate } from "@/types";

export function useOrganizationProfile() {
  return useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => organizationsApi.getProfile(),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });
}

export function useCreateOrganizationProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OrganizationCreate) =>
      organizationsApi.createProfile(data),
    onSuccess: (newProfile) => {
      queryClient.setQueryData(["organization-profile"], newProfile);
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
    },
  });
}

export function useUpdateOrganizationProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OrganizationUpdate) =>
      organizationsApi.updateProfile(data),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["organization-profile"], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
    },
  });
}
