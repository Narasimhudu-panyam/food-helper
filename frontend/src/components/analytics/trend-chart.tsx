"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendDataPoint } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { TrendingUp } from "lucide-react";

export interface TrendChartProps {
  title?: string;
  subtitle?: string;
  data: TrendDataPoint[];
  metricKey?: "weight" | "count";
  className?: string;
}

export function TrendChart({
  title = "Activity Over Time",
  subtitle = "Daily timeline of donations created and delivered",
  data = [],
  metricKey = "weight",
  className,
}: TrendChartProps) {
  const hasData = data && data.length > 0;

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
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            title="No timeline data yet"
            description="Activity trends will appear as donations and deliveries are recorded."
            className="min-h-[220px]"
          />
        ) : (
          <div className="h-[260px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val: string) => {
                    const parts = val.split("-");
                    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
                  }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  formatter={(val: any, name: any) => [
                    metricKey === "weight" ? `${val} kg` : val,
                    name === "weight_kg_donated" || name === "donations_count"
                      ? "Donated"
                      : "Delivered",
                  ]}
                  labelFormatter={(lbl) => `Date: ${lbl}`}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs font-medium text-zinc-600">
                      {value === "weight_kg_donated" || value === "donations_count"
                        ? metricKey === "weight"
                          ? "Donated (kg)"
                          : "Donations Created"
                        : metricKey === "weight"
                        ? "Delivered (kg)"
                        : "Completed Deliveries"}
                    </span>
                  )}
                />
                {metricKey === "weight" ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="weight_kg_donated"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#059669" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight_kg_delivered"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#0284c7" }}
                      activeDot={{ r: 5 }}
                    />
                  </>
                ) : (
                  <>
                    <Line
                      type="monotone"
                      dataKey="donations_count"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#059669" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="delivered_count"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#0284c7" }}
                      activeDot={{ r: 5 }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
