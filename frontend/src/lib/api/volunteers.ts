import { apiClient } from "@/lib/api/client";
import { Volunteer, VolunteerCreate, VolunteerUpdate } from "@/types";

export const volunteersApi = {
  getProfile: async (): Promise<Volunteer | null> => {
    try {
      return await apiClient.get<Volunteer>("/volunteers/profile");
    } catch (err: any) {
      if (err?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  createProfile: async (data: VolunteerCreate): Promise<Volunteer> => {
    return await apiClient.post<Volunteer>("/volunteers/profile", data);
  },

  updateProfile: async (data: VolunteerUpdate): Promise<Volunteer> => {
    return await apiClient.patch<Volunteer>("/volunteers/profile", data);
  },
};
