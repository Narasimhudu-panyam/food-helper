import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUsersApi } from "@/lib/api/admin";
import { AdminUser, AdminUserDetail, AdminUserListParams } from "@/types";

export const ADMIN_USERS_QUERY_KEY = ["admin", "users"];
export const ADMIN_USER_QUERY_KEY = (id: string) => ["admin", "user", id];

export function useAdminUsers(params?: AdminUserListParams) {
  return useQuery<AdminUser[], Error>({
    queryKey: [...ADMIN_USERS_QUERY_KEY, params],
    queryFn: () => adminUsersApi.list(params),
  });
}

export function useAdminUser(id: string) {
  return useQuery<AdminUserDetail, Error>({
    queryKey: ADMIN_USER_QUERY_KEY(id),
    queryFn: () => adminUsersApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation<AdminUser, Error, string>({
    mutationFn: (id: string) => adminUsersApi.activate(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ADMIN_USER_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation<AdminUser, Error, string>({
    mutationFn: (id: string) => adminUsersApi.deactivate(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ADMIN_USER_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
