"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/actions/analytics";
import { cn } from "@/lib/utils";

interface AnalyticsTrendChartProps {
  data: TrendPoint[];
}

type Metric = "revenue" | "orders";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

function compactNumber(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function AnalyticsTrendChart({ data }: AnalyticsTrendChartProps) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const hasData = data.some((point) => point.revenue > 0 || point.orders > 0);
  const currentKey = metric;
  const previousKey = metric === "revenue" ? "previousRevenue" : "previousOrders";

  return (
    <div className="flex min-h-80 flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-bold">Ritmo del periodo</h2>
          <p className="font-body text-sm text-muted-foreground">
            La línea tenue corresponde al periodo anterior.
          </p>
        </div>
        <div className="grid grid-cols-2 rounded-xl bg-surface-raised p-1">
          {(
            [
              ["revenue", "Ventas"],
              ["orders", "Pedidos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMetric(id)}
              aria-pressed={metric === id}
              className={cn(
                "h-9 rounded-lg px-3 font-heading text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                metric === id
                  ? "bg-card text-foreground ring-1 ring-foreground/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {hasData ? (
        <div className="min-h-64 flex-1" aria-label="Gráfica de tendencia">
          <ResponsiveContainer width="100%" height="100%" minHeight={256}>
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeOpacity={0.65}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                minTickGap={24}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={44}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value) => compactNumber(Number(value))}
              />
              <Tooltip
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                contentStyle={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  color: "var(--foreground)",
                  fontFamily: "var(--font-body)",
                  fontSize: "12px",
                  boxShadow: "var(--shadow-float)",
                }}
                labelStyle={{
                  color: "var(--foreground)",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                  marginBottom: 6,
                }}
                formatter={(value, name) => {
                  const numeric = Number(value ?? 0);
                  const previous = String(name).startsWith("previous");
                  return [
                    metric === "revenue" ? currency.format(numeric) : numeric,
                    previous ? "Periodo anterior" : "Periodo elegido",
                  ];
                }}
              />
              <Area
                type="monotone"
                dataKey={previousKey}
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                fill="transparent"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey={currentKey}
                stroke="var(--brand)"
                strokeWidth={2.5}
                fill="var(--brand)"
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 5, fill: "var(--brand)", strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-xl bg-surface-raised/55 px-6 text-center ring-1 ring-foreground/5">
          <p className="font-heading text-sm font-bold">Todavía no hay ventas cobradas</p>
          <p className="mt-1 max-w-sm font-body text-sm text-muted-foreground">
            La tendencia aparecerá cuando se registren cobros dentro de este periodo.
          </p>
        </div>
      )}
    </div>
  );
}
