import { Suspense } from "react";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import {
  OwnerDailyControlLoading,
  OwnerDailyControlUnavailable,
} from "@/components/analytics/owner-daily-control";
import { OwnerDailyControlLoader } from "@/components/analytics/owner-daily-control-loader";
import {
  fetchAnalytics,
  type AnalyticsServiceFilter,
} from "@/lib/actions/analytics";
import { normalizePeriod } from "@/lib/analytics/period";
import { fetchOwnerControl } from "@/lib/actions/owner-report";
import { isOwnerReportEmailEnabled } from "@/lib/owner-report/feature";

const SERVICES: AnalyticsServiceFilter[] = [
  "todos",
  "comedor",
  "domicilio",
  "para_llevar",
  "plataformas",
];

export default async function AnaliticasPage({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    desde?: string;
    hasta?: string;
    servicio?: string;
  }>;
}) {
  const params = await searchParams;
  const period = normalizePeriod(params.vista, params.desde, params.hasta);
  const service = SERVICES.includes(params.servicio as AnalyticsServiceFilter)
    ? (params.servicio as AnalyticsServiceFilter)
    : "todos";
  const ownerControlPromise = fetchOwnerControl(period).catch((error: unknown) => {
    console.error("No se pudo cargar el control del dueño", error);
    return null;
  });
  const data = await fetchAnalytics({ period, service });
  const ownerReportEmailEnabled = isOwnerReportEmailEnabled();

  return (
    <AnalyticsDashboard
      data={data}
      ownerControlContent={
        <Suspense
          fallback={
            <OwnerDailyControlLoading
              emailEnabled={ownerReportEmailEnabled}
            />
          }
        >
          <OwnerDailyControlLoader
            analytics={data}
            emailEnabled={ownerReportEmailEnabled}
            operationPromise={ownerControlPromise}
            unavailable={<OwnerDailyControlUnavailable />}
          />
        </Suspense>
      }
    />
  );
}
