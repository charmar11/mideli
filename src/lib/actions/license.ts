"use server";

import { revalidatePath } from "next/cache";
import {
  clearLicenseControlSession,
  getLicenseCredential,
  hashVendorPassword,
  recoverySecretMatches,
  requireLicenseControlSession,
  setLicenseControlSession,
  validateVendorPassword,
  verifyVendorPassword,
} from "@/lib/license-control-server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LicenseActionState = {
  kind: "idle" | "success" | "error";
  message: string;
  submittedAt: number;
};

function actionState(kind: LicenseActionState["kind"], message: string): LicenseActionState {
  return { kind, message, submittedAt: Date.now() };
}

function errorState(message: string) {
  return actionState("error", message);
}

function successState(message: string) {
  revalidatePath("/control/licencia");
  revalidatePath("/sistema-bloqueado");
  return actionState("success", message);
}

function getPasswordPair(formData: FormData) {
  const password = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const validationError = validateVendorPassword(password);
  if (validationError) return { ok: false, error: validationError } as const;
  if (password !== confirmation) {
    return { ok: false, error: "Las contraseñas no coinciden" } as const;
  }
  return { ok: true, password } as const;
}

function licenseErrorMessage(message: string) {
  if (message.includes("MIDELI_LICENSE_INVALID_MONTHS")) return "Selecciona un plazo válido";
  if (message.includes("MIDELI_LICENSE_INVALID_DATE")) return "Selecciona una fecha futura válida";
  if (message.includes("MIDELI_LICENSE_REASON_REQUIRED")) return "Escribe el motivo de la suspensión";
  if (message.includes("MIDELI_LICENSE_RENEWAL_REQUIRED")) return "La vigencia terminó. Renueva la licencia para activarla";
  if (message.includes("MIDELI_LICENSE_CREDENTIAL_EXISTS")) return "La contraseña privada ya fue configurada";
  if (message.includes("MIDELI_LICENSE_CREDENTIAL_MISSING")) return "Primero configura la contraseña privada";
  return "No se pudo completar el cambio";
}

async function storeCredential(password: string, mode: "create" | "change" | "recover") {
  const admin = createAdminClient();
  const { passwordHash, passwordSalt } = await hashVendorPassword(password);
  const { data, error } = await admin.rpc("vendor_store_license_credential", {
    p_password_hash: passwordHash,
    p_password_salt: passwordSalt,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
  const version = Number(data);
  if (!Number.isInteger(version) || version < 1) throw new Error("MIDELI_LICENSE_INVALID_VERSION");
  await setLicenseControlSession(version);
}

async function recordLoginAttempt(success: boolean) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("vendor_record_license_login_attempt", {
    p_success: success,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

async function setupCredential(formData: FormData) {
  const recoverySecret = String(formData.get("recoverySecret") ?? "");
  if (!recoverySecretMatches(recoverySecret)) return errorState("Clave de recuperación incorrecta");
  const pair = getPasswordPair(formData);
  if (!pair.ok) return errorState(pair.error);
  await storeCredential(pair.password, "create");
  return successState("Acceso privado configurado");
}

async function recoverCredential(formData: FormData) {
  const recoverySecret = String(formData.get("recoverySecret") ?? "");
  if (!recoverySecretMatches(recoverySecret)) return errorState("Clave de recuperación incorrecta");
  const pair = getPasswordPair(formData);
  if (!pair.ok) return errorState(pair.error);
  await storeCredential(pair.password, "recover");
  return successState("Contraseña recuperada y sesión iniciada");
}

async function login(formData: FormData) {
  const credential = await getLicenseCredential();
  if (!credential) return errorState("Primero configura el acceso privado");

  if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) {
    return errorState("Acceso temporalmente bloqueado. Intenta de nuevo en 15 minutos");
  }

  const password = String(formData.get("password") ?? "");
  const valid = await verifyVendorPassword(password, credential);
  const result = await recordLoginAttempt(valid);
  if (!valid) {
    if (result?.locked_until) {
      return errorState("Cinco intentos incorrectos. Acceso bloqueado durante 15 minutos");
    }
    return errorState("Contraseña incorrecta");
  }

  await setLicenseControlSession(credential.credential_version);
  return successState("Sesión privada iniciada");
}

async function changePassword(formData: FormData) {
  const credential = await requireLicenseControlSession();
  if (!credential) return errorState("La sesión privada terminó. Inicia sesión nuevamente");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!(await verifyVendorPassword(currentPassword, credential))) {
    await recordLoginAttempt(false);
    return errorState("La contraseña actual es incorrecta");
  }

  const pair = getPasswordPair(formData);
  if (!pair.ok) return errorState(pair.error);
  if (pair.password === currentPassword) return errorState("La nueva contraseña debe ser diferente");
  await storeCredential(pair.password, "change");
  return successState("Contraseña actualizada");
}

async function updateLicense(operation: string, formData: FormData) {
  const credential = await requireLicenseControlSession();
  if (!credential) return errorState("La sesión privada terminó. Inicia sesión nuevamente");

  const admin = createAdminClient();
  const months = Number(formData.get("months"));
  const targetDate = String(formData.get("validUntil") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const paymentReference = String(formData.get("paymentReference") ?? "").trim();
  const rpcOperation = operation === "set_date" ? "set_date" : operation;

  const { error } = await admin.rpc("vendor_update_app_license", {
    p_operation: rpcOperation,
    p_months: operation === "renew" ? months : null,
    p_target_date: operation === "set_date" ? targetDate || null : null,
    p_reason: reason,
    p_payment_reference: paymentReference,
  });
  if (error) return errorState(licenseErrorMessage(error.message));

  const messages: Record<string, string> = {
    renew: `Licencia renovada por ${months} ${months === 1 ? "mes" : "meses"}`,
    set_date: "Fecha de vigencia actualizada",
    suspend: "Sistema suspendido inmediatamente",
    reactivate: "Sistema reactivado",
  };
  return successState(messages[operation] ?? "Licencia actualizada");
}

export async function manageLicenseAction(
  _previousState: LicenseActionState,
  formData: FormData
): Promise<LicenseActionState> {
  const operation = String(formData.get("operation") ?? "");

  try {
    if (operation === "setup") return await setupCredential(formData);
    if (operation === "recover") return await recoverCredential(formData);
    if (operation === "login") return await login(formData);
    if (operation === "change_password") return await changePassword(formData);
    if (operation === "logout") {
      await clearLicenseControlSession();
      return successState("Sesión privada cerrada");
    }
    if (["renew", "set_date", "suspend", "reactivate"].includes(operation)) {
      return await updateLicense(operation, formData);
    }
    return errorState("Acción de licencia no reconocida");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Error en el control privado de licencia", message);
    return errorState(licenseErrorMessage(message));
  }
}
