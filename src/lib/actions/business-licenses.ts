"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformLicenseManager } from "@/lib/server/platform-manager";

export type BusinessLicenseMutation =
  | { operation: "activate"; businessId: string; months?: number; validUntil?: string }
  | { operation: "renew"; businessId: string; months: number }
  | { operation: "set_date"; businessId: string; validUntil: string }
  | { operation: "suspend" | "reactivate"; businessId: string; note?: string };

export type BusinessLicenseActionResult = {
  success: boolean;
  error: string | null;
};

function isBusinessLicenseBusinessId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function licenseActionError(message: string) {
  if (message.includes("LICENSE_MANAGER_REQUIRED")) return "No tienes permiso para administrar estas licencias";
  if (message.includes("LICENSE_INVALID_MONTHS")) return "Selecciona una vigencia válida";
  if (message.includes("LICENSE_NOTE_REQUIRED")) return "Escribe un motivo para suspender el acceso";
  if (message.includes("LICENSE_RENEWAL_REQUIRED")) return "Renueva la vigencia antes de reactivar el negocio";
  if (message.includes("LICENSE_ALREADY_ASSIGNED")) return "Este negocio ya tiene una licencia asignada";
  if (message.includes("LICENSE_REQUIRES_INACTIVE_BUSINESS")) return "Sólo se puede asignar la primera vigencia a un negocio en borrador o pausado";
  if (message.includes("LICENSE_NOT_ASSIGNED")) return "El negocio todavía no tiene una licencia asignada";
  if (message.includes("LICENSE_NOT_ACTIVE")) return "La licencia no está en un estado que permita esa acción";
  if (message.includes("LICENSE_NOT_SUSPENDED")) return "La licencia no está suspendida";
  if (message.includes("LICENSE_BUSINESS_NOT_OPERABLE")) return "El negocio archivado ya no puede cambiar de licencia";
  return "No se pudo actualizar la licencia. Intenta de nuevo.";
}

export async function manageBusinessLicenseAction(
  input: BusinessLicenseMutation,
): Promise<BusinessLicenseActionResult> {
  try {
    await requirePlatformLicenseManager();
    if (!isBusinessLicenseBusinessId(input.businessId)) {
      return { success: false, error: "Selecciona un negocio válido" };
    }
    if ("months" in input && input.months !== undefined && ![1, 3, 6, 12].includes(input.months)) {
      return { success: false, error: "Selecciona una vigencia de 1, 3, 6 o 12 meses" };
    }
    const requiresValidUntil =
      input.operation === "set_date" ||
      (input.operation === "activate" && input.validUntil !== undefined);
    if (requiresValidUntil && (!input.validUntil || !isCalendarDate(input.validUntil))) {
      return { success: false, error: "Selecciona una fecha válida" };
    }
    if ("note" in input && (input.note?.trim().length ?? 0) > 500) {
      return { success: false, error: "La nota no puede superar 500 caracteres" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("manage_platform_business_license", {
      p_business_id: input.businessId,
      p_operation: input.operation,
      p_months: "months" in input ? input.months ?? null : null,
      p_target_date: "validUntil" in input ? input.validUntil ?? null : null,
      p_note: "note" in input ? input.note?.trim() ?? "" : "",
    });
    if (error) return { success: false, error: licenseActionError(error.message) };

    revalidatePath("/settings/licencias");
    revalidatePath("/settings/negocios");
    revalidatePath("/dashboard");
    return { success: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "No autenticado" || message.includes("No tienes permisos")) {
      return { success: false, error: message };
    }
    console.error("No se pudo actualizar una licencia de negocio", message);
    return { success: false, error: licenseActionError(message) };
  }
}

export async function setPlatformEmergencySuspensionAction(input: {
  suspended: boolean;
  note: string;
}): Promise<BusinessLicenseActionResult> {
  try {
    await requirePlatformLicenseManager();
    const note = input.note.trim();
    if (note.length < 3 || note.length > 500) {
      return { success: false, error: "Escribe un motivo de entre 3 y 500 caracteres" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_platform_emergency_suspension", {
      p_suspended: input.suspended,
      p_note: note,
    });
    if (error) return { success: false, error: licenseActionError(error.message) };
    revalidatePath("/settings/licencias");
    revalidatePath("/dashboard");
    return { success: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "No autenticado" || message.includes("No tienes permisos")) {
      return { success: false, error: message };
    }
    console.error("No se pudo cambiar la suspensión técnica", message);
    return { success: false, error: licenseActionError(message) };
  }
}

export async function getBusinessLicenseEventsAction(businessId: string) {
  try {
    await requirePlatformLicenseManager();
    if (!isBusinessLicenseBusinessId(businessId)) {
      return { events: [], error: "Selecciona un negocio válido" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_platform_business_license_events",
      { p_business_id: businessId },
    );
    if (error) {
      console.warn("No se pudo cargar el historial de licencias", error.code);
      return { events: [], error: "No se pudo cargar el historial" };
    }
    return { events: data ?? [], error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      events: [],
      error: message.includes("No tienes permisos")
        ? message
        : "No se pudo cargar el historial",
    };
  }
}
