import type { NextRequest } from "next/server";
import { previousHermosilloDateKey } from "@/lib/owner-report/data";
import { deliverOwnerDailyReport } from "@/lib/owner-report/delivery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const reportDate = previousHermosilloDateKey();
    const result = await deliverOwnerDailyReport(reportDate);
    return Response.json({ ok: true, reportDate, status: result.status });
  } catch (error) {
    console.error("Falló el reporte diario del dueño", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
