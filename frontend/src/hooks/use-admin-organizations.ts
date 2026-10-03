import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminOrganizationsApi } from "@/lib/api/admin";
import { AdminOrganization, AdminOrganizationListParams } from "@/types";

export const ADMIN_ORGANIZATIONS_QUERY_KEY = ["admin", "organizations"];
export const ADMIN_ORGANIZATION_QUERY_KEY = (id: string) => ["admin", "organization", id];

export function useAdminOrganizations(params?: AdminOrganizationListParams) {
  return useQuery<AdminOrganization[], Error>({
    queryKey: [...ADMIN_ORGANIZATIONS_QUERY_KEY, params],
    queryFn: () => adminOrganizationsApi.list(params),
  });
}

export function useAdminOrganization(id: string) {
  return useQuery<AdminOrganization, Error>({
    queryKey: ADMIN_ORGANIZATION_QUERY_KEY(id),
    queryFn: () => adminOrganizationsApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useVerifyOrganization() {
  const queryClient = useQueryClient();

  return useMutation<AdminOrganization, Error, string>({
    mutationFn: (id: string) => adminOrganizationsApi.verify(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_ORGANIZATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ADMIN_ORGANIZATION_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useRejectOrganization() {
  const queryClient = useQueryClient();

  return useMutation<AdminOrganization, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => adminOrganizationsApi.reject(id, reason),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_ORGANIZATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ADMIN_ORGANIZATION_QUERY_KEY(variables.id) });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
