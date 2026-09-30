import { apiClient } from "@/lib/api/client";
import { FoodBusiness, FoodBusinessCreate, FoodBusinessUpdate } from "@/types";

export const businessApi = {
  getProfile: async (): Promise<FoodBusiness | null> => {
    try {
      return await apiClient.get<FoodBusiness>("/businesses/profile");
    } catch (err: any) {
      if (err?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  createProfile: async (data: FoodBusinessCreate): Promise<FoodBusiness> => {
    return await apiClient.post<FoodBusiness>("/businesses/profile", data);
  },

  updateProfile: async (data: FoodBusinessUpdate): Promise<FoodBusiness> => {
    return await apiClient.patch<FoodBusiness>("/businesses/profile", data);
  },
};
