import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyticsApi } from "@/lib/api/analytics";
import { apiClient } from "@/lib/api/client";
import { AnalyticsOverview } from "@/types";

describe("Analytics API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls /analytics/overview with default options", async () => {
    const mockOverview: AnalyticsOverview = {
      role: "FOOD_BUSINESS",
      time_range: "30d",
      summary: {
        total_donations: 10,
        active_donations: 2,
        delivered_donations: 8,
        cancelled_donations: 0,
        total_weight_kg_donated: 120.0,
        total_weight_kg_delivered: 95.0,
        total_pickups: 8,
        active_pickups: 1,
        delivered_pickups: 7,
        failed_pickups: 0,
      },
      matching: {
        total_matches: 12,
        accepted_matches: 8,
        declined_matches: 2,
        acceptance_rate: 80.0,
        avg_distance_km: 3.5,
        avg_match_score: 90.0,
      },
      categories: [
        { category: "BAKERY", count: 6, total_weight_kg: 60.0 },
        { category: "PRODUCE", count: 4, total_weight_kg: 60.0 },
      ],
      trends: [
        {
          date: "2026-10-01",
          donations_count: 5,
          delivered_count: 4,
          weight_kg_donated: 50.0,
          weight_kg_delivered: 40.0,
        },
      ],
      role_metrics: {
        business_name: "Sunrise Cafe",
      },
    };

    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue(mockOverview);

    const result = await analyticsApi.getOverview({ timeRange: "30d" });

    expect(getSpy).toHaveBeenCalledWith("/analytics/overview?time_range=30d");
    expect(result.summary.total_donations).toBe(10);
    expect(result.summary.total_weight_kg_donated).toBe(120.0);
    expect(result.matching.acceptance_rate).toBe(80.0);
    expect(result.role_metrics.business_name).toBe("Sunrise Cafe");
  });

  it("constructs query string with custom start and end dates", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({} as any);

    await analyticsApi.getOverview({
      startDate: "2026-09-01T00:00:00Z",
      endDate: "2026-09-30T23:59:59Z",
    });

    expect(getSpy).toHaveBeenCalledWith(
      "/analytics/overview?start_date=2026-09-01T00%3A00%3A00Z&end_date=2026-09-30T23%3A59%3A59Z"
    );
  });
});
