import { NextRequest, NextResponse } from "next/server";
import { runWhatsappScheduler } from "@/lib/whatsapp/scheduler.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runWhatsappScheduler()) });
  } catch {
    return NextResponse.json({ error: "No se pudo ejecutar el ciclo operativo de WhatsApp" }, { status: 500 });
  }
}
