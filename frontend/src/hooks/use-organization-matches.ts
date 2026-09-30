import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { matchesApi } from "@/lib/api/matches";
import { ListMatchesParams, organizationsApi } from "@/lib/api/organizations";
import { MatchAcceptRequest, MatchDeclineRequest } from "@/types";

export function useOrganizationMatches(params?: ListMatchesParams) {
  return useQuery({
    queryKey: ["organization-matches", params],
    queryFn: () => organizationsApi.listIncomingMatches(params),
    staleTime: 1000 * 30, // 30 seconds fresh
  });
}

export function useMatch(matchId: string) {
  return useQuery({
    queryKey: ["match", matchId],
    queryFn: () => matchesApi.getMatch(matchId),
    enabled: Boolean(matchId),
  });
}

export function useAcceptMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      matchId,
      data,
    }: {
      matchId: string;
      data: MatchAcceptRequest;
    }) => matchesApi.acceptMatch(matchId, data),
    onSuccess: (updatedMatch) => {
      // Invalidate both the match lists and the specific match detail
      queryClient.setQueryData(["match", updatedMatch.id], updatedMatch);
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
      queryClient.invalidateQueries({ queryKey: ["match", updatedMatch.id] });
      // Invalidate organization profile to refresh updated capacity
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
    },
  });
}

export function useDeclineMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      matchId,
      data,
    }: {
      matchId: string;
      data: MatchDeclineRequest;
    }) => matchesApi.declineMatch(matchId, data),
    onSuccess: (updatedMatch) => {
      queryClient.setQueryData(["match", updatedMatch.id], updatedMatch);
      queryClient.invalidateQueries({ queryKey: ["organization-matches"] });
      queryClient.invalidateQueries({ queryKey: ["match", updatedMatch.id] });
    },
  });
}
