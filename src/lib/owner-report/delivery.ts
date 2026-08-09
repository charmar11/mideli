import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchOwnerDailySalesData,
  fetchOwnerOperationalData,
} from "@/lib/owner-report/data";
import { renderOwnerDailyEmail } from "@/lib/owner-report/email";
import { sendEmail } from "@/server/resend";

interface ReportSettingsRow {
  enabled: boolean;
  recipient_email: string;
}

interface ExistingRunRow {
  id: string;
  status: "processing" | "sent" | "failed";
  attempt_count: number;
  updated_at: string;
}

function dayPeriod(date: string) {
  return { view: "dia" as const, from: date, to: date };
}

async function prepareReportData(reportDate: string) {
  const supabase = createAdminClient();
  const [sales, operation] = await Promise.all([
    fetchOwnerDailySalesData(supabase, reportDate),
    fetchOwnerOperationalData(supabase, dayPeriod(reportDate)),
  ]);
  return { sales, operation };
}

export async function sendOwnerReportPreview(
  recipientEmail: string,
  reportDate: string
) {
  const { sales, operation } = await prepareReportData(reportDate);
  return sendEmail({
    to: recipientEmail,
    subject: `Vista previa Mideli | ${reportDate}`,
    html: renderOwnerDailyEmail(sales, operation, { preview: true }),
  });
}

export async function deliverOwnerDailyReport(reportDate: string): Promise<{
  status: "disabled" | "already_sent" | "already_running" | "sent";
}> {
  const supabase = createAdminClient();
  const { data: settingsData, error: settingsError } = await supabase
    .from("owner_report_settings")
    .select("enabled,recipient_email")
    .eq("id", 1)
    .maybeSingle();

  if (settingsError) throw settingsError;
  const settings = settingsData as ReportSettingsRow | null;
  if (!settings?.enabled || !settings.recipient_email) {
    return { status: "disabled" };
  }

  const { data: runData, error: runError } = await supabase
    .from("owner_daily_report_runs")
    .select("id,status,attempt_count,updated_at")
    .eq("report_date", reportDate)
    .maybeSingle();
  if (runError) throw runError;

  const existingRun = runData as ExistingRunRow | null;
  if (existingRun?.status === "sent") {
    return { status: "already_sent" };
  }
  if (
    existingRun?.status === "processing" &&
    Date.now() - new Date(existingRun.updated_at).getTime() < 15 * 60_000
  ) {
    return { status: "already_running" };
  }

  let runId: string;
  if (existingRun) {
    runId = existingRun.id;
    const nextUpdatedAt = new Date().toISOString();
    const { data: claimedRun, error } = await supabase
      .from("owner_daily_report_runs")
      .update({
        status: "processing",
        attempt_count: (existingRun?.attempt_count ?? 0) + 1,
        error_message: "",
        started_at: nextUpdatedAt,
        updated_at: nextUpdatedAt,
      })
      .eq("id", runId)
      .eq("updated_at", existingRun.updated_at)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!claimedRun) return { status: "already_running" };
  } else {
    const { data, error } = await supabase
      .from("owner_daily_report_runs")
      .insert({ report_date: reportDate })
      .select("id")
      .single();
    if (error) {
      const { data: concurrentRun } = await supabase
        .from("owner_daily_report_runs")
        .select("id,status")
        .eq("report_date", reportDate)
        .maybeSingle();
      if (concurrentRun?.status === "sent") {
        return { status: "already_sent" };
      }
      if (concurrentRun?.status === "processing") {
        return { status: "already_running" };
      }
      throw error;
    }
    runId = data.id;
  }

  try {
    const { sales, operation } = await prepareReportData(reportDate);
    const response = await sendEmail({
      to: settings.recipient_email,
      subject: `Resumen Mideli | ${reportDate}`,
      html: renderOwnerDailyEmail(sales, operation),
    });

    if (response.error) throw new Error(response.error.message);

    const { error: updateError } = await supabase
      .from("owner_daily_report_runs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw updateError;
    return { status: "sent" };
  } catch (error) {
    await supabase
      .from("owner_daily_report_runs")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 500) : "Error desconocido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw error;
  }
}
