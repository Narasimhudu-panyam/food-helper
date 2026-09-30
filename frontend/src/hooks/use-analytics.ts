import { useQuery } from "@tanstack/react-query";
import { analyticsApi, AnalyticsQueryOptions } from "@/lib/api/analytics";
import { AnalyticsOverview } from "@/types";

export const ANALYTICS_QUERY_KEY = ["analytics"];

export function useAnalyticsOverview(options: AnalyticsQueryOptions = {}) {
  const timeRange = options.timeRange || "30d";
  return useQuery<AnalyticsOverview>({
    queryKey: [...ANALYTICS_QUERY_KEY, "overview", timeRange, options.startDate, options.endDate],
    queryFn: () => analyticsApi.getOverview(options),
    staleTime: 60 * 1000, // 1 minute stale time for read-heavy aggregate queries
  });
}
