import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc(
    "redact_expired_channel_messages"
  );
  if (error) {
    const migrationPending = error.code === "42883" || error.code === "42P01";
    return NextResponse.json(
      { error: migrationPending ? "La migración de WhatsApp está pendiente" : "No se pudo aplicar la retención" },
      { status: migrationPending ? 409 : 500 }
    );
  }

  return NextResponse.json({ redacted: Number(data ?? 0) });
}
