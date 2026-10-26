import type { ReactNode } from "react";
import { OwnerDailyControl } from "@/components/analytics/owner-daily-control";
import type { AnalyticsData } from "@/lib/actions/analytics";
import type { OwnerOperationalData } from "@/lib/owner-report/types";

export async function OwnerDailyControlLoader({
  analytics,
  emailEnabled,
  operationPromise,
  unavailable,
}: {
  analytics: AnalyticsData;
  emailEnabled: boolean;
  operationPromise: Promise<OwnerOperationalData | null>;
  unavailable: ReactNode;
}) {
  const operation = await operationPromise;
  if (!operation) return unavailable;

  return (
    <OwnerDailyControl
      analytics={analytics}
      operation={operation}
      emailEnabled={emailEnabled}
    />
  );
}
