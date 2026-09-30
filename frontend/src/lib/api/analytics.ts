import { apiClient } from "@/lib/api/client";
import { AnalyticsOverview, TimeRangePreset } from "@/types";

export interface AnalyticsQueryOptions {
  timeRange?: TimeRangePreset;
  startDate?: string;
  endDate?: string;
}

export const analyticsApi = {
  getOverview: async (options: AnalyticsQueryOptions = {}): Promise<AnalyticsOverview> => {
    const params = new URLSearchParams();
    if (options.timeRange) {
      params.append("time_range", options.timeRange);
    }
    if (options.startDate) {
      params.append("start_date", options.startDate);
    }
    if (options.endDate) {
      params.append("end_date", options.endDate);
    }

    const queryString = params.toString();
    const endpoint = `/analytics/overview${queryString ? `?${queryString}` : ""}`;
    return await apiClient.get<AnalyticsOverview>(endpoint);
  },
};
