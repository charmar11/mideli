import "server-only";

import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "mideli_license_control";
const SESSION_DURATION_SECONDS = 30 * 60;

export type LicenseCredential = {
  id: number;
  password_hash: string;
  password_salt: string;
  credential_version: number;
  failed_attempts: number;
  locked_until: string | null;
  password_changed_at: string;
};

export type LicenseControlEvent = {
  id: string;
  event_type: string;
  previous_status: "active" | "suspended" | null;
  next_status: "active" | "suspended" | null;
  previous_valid_until: string | null;
  next_valid_until: string | null;
  reason: string;
  payment_reference: string;
  created_at: string;
};

type SessionPayload = {
  version: 1;
  credentialVersion: number;
  expiresAt: number;
};

export type LicenseControlAccess = {
  configured: boolean;
  authenticated: boolean;
  lockedUntil: string | null;
};

function safeTextMatch(input: string, expected: string | undefined) {
  if (!input || !expected) return false;
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && timingSafeEqual(inputBuffer, expectedBuffer);
}

function sessionSecret() {
  const secret = process.env.MIDELI_LICENSE_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MIDELI_LICENSE_SESSION_SECRET no está configurado de forma segura");
  }
  return secret;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  let expectedSignature: string;
  try {
    expectedSignature = signPayload(encodedPayload);
  } catch {
    return null;
  }

  if (!safeTextMatch(providedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (
      payload.version !== 1 ||
      !Number.isInteger(payload.credentialVersion) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function recoverySecretMatches(input: string) {
  return safeTextMatch(input, process.env.MIDELI_LICENSE_ADMIN_SECRET);
}

export function validateVendorPassword(password: string) {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (password.length > 128) return "La contraseña no puede superar 128 caracteres";
  return null;
}

export async function hashVendorPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return {
    passwordHash: derivedKey.toString("hex"),
    passwordSalt: salt.toString("hex"),
  };
}

export async function verifyVendorPassword(password: string, credential: LicenseCredential) {
  try {
    const salt = Buffer.from(credential.password_salt, "hex");
    const expected = Buffer.from(credential.password_hash, "hex");
    const derivedKey = (await scryptAsync(password, salt, expected.length)) as Buffer;
    return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}

export async function getLicenseCredential() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("license_control_credentials")
    .select(
      "id, password_hash, password_salt, credential_version, failed_attempts, locked_until, password_changed_at"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error("No se pudo consultar el acceso privado");
  return data as LicenseCredential | null;
}

export async function canCreateInitialLicenseCredential() {
  const supabase = await createServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return false;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  return Boolean(
    !profileError &&
      profile?.is_active &&
      ["owner", "admin"].includes(profile.role)
  );
}

export async function setLicenseControlSession(credentialVersion: number) {
  const payload: SessionPayload = {
    version: 1,
    credentialVersion,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const token = `${encodedPayload}.${signPayload(encodedPayload)}`;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/control/licencia",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearLicenseControlSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/control/licencia",
    maxAge: 0,
  });
}

async function sessionMatchesCredential(credential: LicenseCredential) {
  const cookieStore = await cookies();
  const payload = parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  return payload?.credentialVersion === credential.credential_version;
}

function credentialIsLocked(credential: LicenseCredential) {
  return Boolean(
    credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()
  );
}

export async function getLicenseControlAccess(): Promise<LicenseControlAccess> {
  const credential = await getLicenseCredential();
  if (!credential) {
    return { configured: false, authenticated: false, lockedUntil: null };
  }

  return {
    configured: true,
    authenticated:
      !credentialIsLocked(credential) && (await sessionMatchesCredential(credential)),
    lockedUntil: credential.locked_until,
  };
}

export async function requireLicenseControlSession() {
  const credential = await getLicenseCredential();
  if (
    !credential ||
    credentialIsLocked(credential) ||
    !(await sessionMatchesCredential(credential))
  ) {
    return null;
  }
  return credential;
}

export async function getLicenseControlEvents(limit = 30) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("license_control_events")
    .select(
      "id, event_type, previous_status, next_status, previous_valid_until, next_valid_until, reason, payment_reference, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("No se pudo consultar el historial de licencia");
  return (data ?? []) as LicenseControlEvent[];
}
