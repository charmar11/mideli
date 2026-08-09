import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import {
  fetchAnalytics,
  type AnalyticsServiceFilter,
} from "@/lib/actions/analytics";
import { normalizePeriod } from "@/lib/analytics/period";
import { fetchOwnerControl } from "@/lib/actions/owner-report";

const SERVICES: AnalyticsServiceFilter[] = [
  "todos",
  "comedor",
  "domicilio",
  "para_llevar",
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
  const [data, ownerControl] = await Promise.all([
    fetchAnalytics({ period, service }),
    fetchOwnerControl(period),
  ]);

  return <AnalyticsDashboard data={data} ownerControl={ownerControl} />;
}
