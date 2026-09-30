import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { volunteersApi } from "@/lib/api/volunteers";
import { VolunteerCreate, VolunteerUpdate } from "@/types";

export function useVolunteerProfile() {
  return useQuery({
    queryKey: ["volunteer-profile"],
    queryFn: () => volunteersApi.getProfile(),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });
}

export function useCreateVolunteerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VolunteerCreate) => volunteersApi.createProfile(data),
    onSuccess: (newProfile) => {
      queryClient.setQueryData(["volunteer-profile"], newProfile);
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

export function useUpdateVolunteerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VolunteerUpdate) => volunteersApi.updateProfile(data),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["volunteer-profile"], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

export function useToggleVolunteerAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (is_available: boolean) =>
      volunteersApi.updateProfile({ is_available }),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["volunteer-profile"], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}
