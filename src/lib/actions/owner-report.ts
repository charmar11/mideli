"use server";

import { revalidatePath } from "next/cache";
import type { AnalyticsPeriod } from "@/lib/analytics/period";
import { fetchOwnerOperationalData } from "@/lib/owner-report/data";
import { sendOwnerReportPreview } from "@/lib/owner-report/delivery";
import {
  isOwnerReportEmailEnabled,
  OWNER_REPORT_EMAIL_DISABLED_MESSAGE,
} from "@/lib/owner-report/feature";
import { createClient } from "@/lib/supabase/server";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function requireReportAdmin() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) throw new Error("Debes iniciar sesión.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (
    profileError ||
    !profile?.is_active ||
    !["owner", "admin"].includes(profile.role)
  ) {
    throw new Error("No tienes permiso para consultar este reporte.");
  }

  return { supabase, userId };
}

export async function fetchOwnerControl(period: AnalyticsPeriod) {
  const { supabase } = await requireReportAdmin();
  return fetchOwnerOperationalData(supabase, period);
}

export async function updateOwnerReportSettings(input: {
  enabled: boolean;
  recipientEmail: string;
}): Promise<{ error: string | null; recipientEmail: string | null }> {
  if (!isOwnerReportEmailEnabled()) {
    return { error: OWNER_REPORT_EMAIL_DISABLED_MESSAGE, recipientEmail: null };
  }

  try {
    const { supabase, userId } = await requireReportAdmin();
    const recipientEmail = input.recipientEmail.trim().toLowerCase();

    if (
      (input.enabled || recipientEmail.length > 0) &&
      !EMAIL_PATTERN.test(recipientEmail)
    ) {
      return {
        error: "Escribe un correo válido antes de activar el reporte.",
        recipientEmail: null,
      };
    }

    const { data, error } = await supabase
      .from("owner_report_settings")
      .update({
        enabled: input.enabled,
        recipient_email: recipientEmail,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("recipient_email")
      .single();
    if (error) throw error;

    revalidatePath("/dashboard/analiticas");
    return { error: null, recipientEmail: data.recipient_email };
  } catch (error) {
    console.error("No se pudo guardar el reporte diario", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración.",
      recipientEmail: null,
    };
  }
}

function reportDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("testing emails") ||
    normalized.includes("verify a domain") ||
    normalized.includes("own email") ||
    normalized.includes("domain is not verified")
  ) {
    return "El correo quedó guardado, pero el servicio de envío necesita un remitente verificado para entregar a esta dirección.";
  }

  return message || "No se pudo enviar la prueba.";
}

export async function sendOwnerReportTest(input: {
  recipientEmail: string;
  reportDate: string;
}): Promise<{ error: string | null }> {
  if (!isOwnerReportEmailEnabled()) {
    return { error: OWNER_REPORT_EMAIL_DISABLED_MESSAGE };
  }

  try {
    await requireReportAdmin();
    const recipientEmail = input.recipientEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(recipientEmail)) {
      return { error: "Escribe un correo válido para enviar la prueba." };
    }
    if (!DATE_PATTERN.test(input.reportDate)) {
      return { error: "La fecha del reporte no es válida." };
    }

    const result = await sendOwnerReportPreview(recipientEmail, input.reportDate);
    if (result.error) throw new Error(result.error.message);
    return { error: null };
  } catch (error) {
    console.error("No se pudo enviar la prueba del reporte", error);
    return { error: reportDeliveryError(error) };
  }
}
