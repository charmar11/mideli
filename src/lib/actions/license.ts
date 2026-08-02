"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { APP_LICENSE_ID, type AppLicenseRecord } from "@/lib/license";
import { createAdminClient } from "@/lib/supabase/admin";

export type LicenseActionState = {
  kind: "idle" | "success" | "error";
  message: string;
  submittedAt: number;
};

function secretMatches(input: string) {
  const expected = process.env.MIDELI_LICENSE_ADMIN_SECRET;
  if (!expected || !input) return false;

  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && timingSafeEqual(inputBuffer, expectedBuffer);
}

function errorState(message: string): LicenseActionState {
  return { kind: "error", message, submittedAt: Date.now() };
}

export async function updateLicenseAction(
  _previousState: LicenseActionState,
  formData: FormData
): Promise<LicenseActionState> {
  const secret = String(formData.get("secret") ?? "");
  if (!secretMatches(secret)) return errorState("Clave de control incorrecta");

  const operation = String(formData.get("operation") ?? "");

  try {
    const admin = createAdminClient();
    const { data: current } = await admin
      .from("app_license")
      .select("id, status, valid_until, updated_at")
      .eq("id", APP_LICENSE_ID)
      .maybeSingle();

    let status: AppLicenseRecord["status"] = "active";
    let validUntil = new Date();
    let message = "Licencia actualizada";

    if (operation === "extend_30") {
      const currentDate = current?.valid_until ? new Date(current.valid_until) : null;
      const base = currentDate && currentDate.getTime() > Date.now() ? currentDate : new Date();
      validUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
      message = "Licencia activada por 30 días";
    } else if (operation === "set_date") {
      const date = String(formData.get("validUntil") ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorState("Selecciona una fecha válida");
      validUntil = new Date(`${date}T23:59:59.999-07:00`);
      if (validUntil.getTime() <= Date.now()) return errorState("La fecha debe ser posterior a hoy");
      message = "Fecha de licencia actualizada";
    } else if (operation === "suspend") {
      status = "suspended";
      validUntil = current?.valid_until ? new Date(current.valid_until) : new Date();
      message = "Sistema suspendido inmediatamente";
    } else {
      return errorState("Acción de licencia no reconocida");
    }

    const { error } = await admin.from("app_license").upsert({
      id: APP_LICENSE_ID,
      status,
      valid_until: validUntil.toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) return errorState("No se pudo actualizar la licencia");

    revalidatePath("/control/licencia");
    revalidatePath("/sistema-bloqueado");

    return { kind: "success", message, submittedAt: Date.now() };
  } catch (error) {
    console.error("Error al administrar la licencia", error);
    return errorState("No se pudo conectar con el control de licencia");
  }
}
