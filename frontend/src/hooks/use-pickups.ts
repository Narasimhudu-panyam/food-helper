import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPickupsParams, pickupsApi } from "@/lib/api/pickups";
import {
  PickupAssignVolunteerRequest,
  PickupCancelRequest,
  PickupCreateRequest,
  PickupFailRequest,
  PickupVerifyDeliveryRequest,
} from "@/types";

export function usePickups(params?: ListPickupsParams) {
  return useQuery({
    queryKey: ["pickups", params],
    queryFn: () => pickupsApi.listPickups(params),
    staleTime: 1000 * 30, // 30 seconds fresh
  });
}

// Backward compatibility alias for volunteer components
export const useVolunteerPickups = usePickups;

export function usePickup(pickupId: string) {
  return useQuery({
    queryKey: ["pickup", pickupId],
    queryFn: () => pickupsApi.getPickup(pickupId),
    enabled: Boolean(pickupId),
  });
}

export function usePickupVolunteers(pickupId: string, enabled = true) {
  return useQuery({
    queryKey: ["pickup-volunteers", pickupId],
    queryFn: () => pickupsApi.getEligibleVolunteers(pickupId),
    enabled: Boolean(pickupId) && enabled,
    staleTime: 1000 * 15,
  });
}

export function useCreatePickupForMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      matchId,
      data,
    }: {
      matchId: string;
      data: PickupCreateRequest;
    }) => pickupsApi.createPickupForMatch(matchId, data),
    onSuccess: (newPickup) => {
      queryClient.setQueryData(["pickup", newPickup.id], newPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["match"] });
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
      queryClient.invalidateQueries({ queryKey: ["donation"] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donation-offers"] });
    },
  });
}

export function useStartPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pickupId: string) => pickupsApi.startPickup(pickupId),
    onSuccess: (updatedPickup) => {
      queryClient.setQueryData(["pickup", updatedPickup.id], updatedPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["pickup", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["donation", updatedPickup.donation_id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
    },
  });
}

export function useCompletePickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pickupId,
      data,
    }: {
      pickupId: string;
      data?: PickupVerifyDeliveryRequest;
    }) => pickupsApi.completePickup(pickupId, data),
    onSuccess: (updatedPickup) => {
      queryClient.setQueryData(["pickup", updatedPickup.id], updatedPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["pickup", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["donation", updatedPickup.donation_id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

export function useCancelPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pickupId,
      data,
    }: {
      pickupId: string;
      data: PickupCancelRequest;
    }) => pickupsApi.cancelPickup(pickupId, data),
    onSuccess: (updatedPickup) => {
      queryClient.setQueryData(["pickup", updatedPickup.id], updatedPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["pickup", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["donation", updatedPickup.donation_id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

export function useFailPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pickupId,
      data,
    }: {
      pickupId: string;
      data: PickupFailRequest;
    }) => pickupsApi.failPickup(pickupId, data),
    onSuccess: (updatedPickup) => {
      queryClient.setQueryData(["pickup", updatedPickup.id], updatedPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["pickup", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["donation", updatedPickup.donation_id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

export function useAssignVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pickupId,
      data,
    }: {
      pickupId: string;
      data?: PickupAssignVolunteerRequest;
    }) => pickupsApi.assignVolunteer(pickupId, data),
    onSuccess: (updatedPickup) => {
      queryClient.setQueryData(["pickup", updatedPickup.id], updatedPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["pickup", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["pickup-volunteers", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

export function useReleaseVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pickupId: string) => pickupsApi.releaseVolunteer(pickupId),
    onSuccess: (updatedPickup) => {
      queryClient.setQueryData(["pickup", updatedPickup.id], updatedPickup);
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["pickup", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["pickup-volunteers", updatedPickup.id] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-profile"] });
    },
  });
}

