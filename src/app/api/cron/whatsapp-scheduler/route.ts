import { NextRequest, NextResponse } from "next/server";
import { runWhatsappScheduler } from "@/lib/whatsapp/scheduler.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.WHATSAPP_SCHEDULER_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (!validSecrets.some((secret) => authorization === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runWhatsappScheduler()) });
  } catch {
    return NextResponse.json({ error: "No se pudo ejecutar el ciclo operativo de WhatsApp" }, { status: 500 });
  }
}
