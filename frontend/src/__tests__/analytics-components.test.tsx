import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { TrendChart } from "@/components/analytics/trend-chart";
import { CategoryChart } from "@/components/analytics/category-chart";
import { Scale } from "lucide-react";

// Mock Recharts container to avoid 0-width in jsdom
vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    ),
  };
});

describe("Analytics Components Suite", () => {
  describe("KpiCard", () => {
    it("renders title, formatted value, and contextual subtitle", () => {
      render(
        <KpiCard
          title="Food Rescued"
          value="450.5 kg"
          subtitle="of 500.0 kg total donated"
          icon={<Scale data-testid="scale-icon" />}
          variant="sky"
        />
      );

      expect(screen.getByText("Food Rescued")).toBeInTheDocument();
      expect(screen.getByText("450.5 kg")).toBeInTheDocument();
      expect(screen.getByText("of 500.0 kg total donated")).toBeInTheDocument();
      expect(screen.getByTestId("scale-icon")).toBeInTheDocument();
    });
  });

  describe("TimeRangeSelector", () => {
    it("renders 7D, 30D, 90D, and All Time options", () => {
      const handleChange = vi.fn();
      render(
        <TimeRangeSelector value="30d" onChange={handleChange} />
      );

      expect(screen.getByText("7 Days")).toBeInTheDocument();
      expect(screen.getByText("30 Days")).toBeInTheDocument();
      expect(screen.getByText("90 Days")).toBeInTheDocument();
      expect(screen.getByText("All Time")).toBeInTheDocument();

      fireEvent.click(screen.getByText("7 Days"));
      expect(handleChange).toHaveBeenCalledWith("7d");

      fireEvent.click(screen.getByText("All Time"));
      expect(handleChange).toHaveBeenCalledWith("all");
    });
  });

  describe("TrendChart", () => {
    it("renders empty state when data array is empty", () => {
      render(
        <TrendChart
          title="Activity Over Time"
          data={[]}
        />
      );

      expect(screen.getByText("Activity Over Time")).toBeInTheDocument();
      expect(screen.getByText("No timeline data yet")).toBeInTheDocument();
    });

    it("renders chart container when timeline data is provided", () => {
      const data = [
        {
          date: "2026-10-01",
          donations_count: 3,
          delivered_count: 2,
          weight_kg_donated: 30,
          weight_kg_delivered: 20,
        },
      ];

      render(
        <TrendChart
          title="Activity Over Time"
          data={data}
        />
      );

      expect(screen.getByText("Activity Over Time")).toBeInTheDocument();
      expect(screen.queryByText("No timeline data yet")).not.toBeInTheDocument();
    });
  });

  describe("CategoryChart", () => {
    it("renders empty state when categories array is empty", () => {
      render(
        <CategoryChart
          title="Food Categories"
          data={[]}
        />
      );

      expect(screen.getByText("Food Categories")).toBeInTheDocument();
      expect(screen.getByText("No category data")).toBeInTheDocument();
    });

    it("renders chart container when categories data is provided", () => {
      const data = [
        {
          category: "BAKERY",
          count: 5,
          total_weight_kg: 50.0,
        },
      ];

      render(
        <CategoryChart
          title="Food Categories"
          data={data}
        />
      );

      expect(screen.getByText("Food Categories")).toBeInTheDocument();
      expect(screen.queryByText("No category data")).not.toBeInTheDocument();
    });
  });
});
