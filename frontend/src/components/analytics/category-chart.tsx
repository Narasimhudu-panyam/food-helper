"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { CategoryDistribution } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Utensils } from "lucide-react";

export interface CategoryChartProps {
  title?: string;
  subtitle?: string;
  data: CategoryDistribution[];
  valueKey?: "total_weight_kg" | "count";
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  PREPARED_MEALS: "#059669",
  BAKERY: "#d97706",
  PRODUCE: "#16a34a",
  DAIRY: "#0284c7",
  MEAT: "#e11d48",
  PACKAGED: "#7c3aed",
  OTHER: "#71717a",
};

export function CategoryChart({
  title = "Food Categories",
  subtitle = "Physical food weight (kg) by category",
  data = [],
  valueKey = "total_weight_kg",
  className,
}: CategoryChartProps) {
  const hasData = data && data.length > 0;

  const chartData = data.map((item) => ({
    ...item,
    formattedCategory: item.category.replace(/_/g, " "),
  }));

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {subtitle && (
              <p className="mt-1 text-xs text-zinc-500 font-normal">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <Utensils className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            title="No category data"
            description="Categories will be displayed once donations are created."
            className="min-h-[220px]"
          />
        ) : (
          <div className="h-[260px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 40, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="formattedCategory"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  formatter={(val: any) => [
                    valueKey === "total_weight_kg" ? `${val} kg` : val,
                    valueKey === "total_weight_kg" ? "Total Weight" : "Donation Count",
                  ]}
                />
                <Bar
                  dataKey={valueKey}
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CATEGORY_COLORS[entry.category] || "#059669"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
