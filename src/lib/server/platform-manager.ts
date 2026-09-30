import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requirePlatformCapability(
  capabilityCode: string,
  permissionMessage: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No autenticado");

  const admin = createAdminClient();
  const { data: memberships, error: membershipsError } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("scope_type", "platform")
    .eq("status", "active");
  if (membershipsError) throw new Error("No se pudo validar el acceso de plataforma");

  const membershipIds = (memberships ?? []).map((membership) => membership.id);
  if (membershipIds.length === 0) {
    throw new Error(permissionMessage);
  }

  const { data: grants, error: grantsError } = await admin
    .from("membership_capabilities")
    .select("membership_id")
    .in("membership_id", membershipIds)
    .eq("capability_code", capabilityCode)
    .is("organization_id", null)
    .is("business_id", null)
    .is("revoked_at", null);
  if (grantsError) throw new Error("No se pudo validar el acceso de plataforma");

  const { data: capability, error: capabilityError } = await admin
    .from("capabilities")
    .select("code,is_active,scope_type")
    .eq("code", capabilityCode)
    .maybeSingle();
  if (
    capabilityError ||
    !capability ||
    capability.is_active !== true ||
    capability.scope_type !== "platform" ||
    (grants ?? []).length === 0
  ) {
    throw new Error(permissionMessage);
  }

  return { actorId: user.id, admin };
}

/** Resolves the platform grant from live membership/capability rows. */
export async function requirePlatformManager() {
  return requirePlatformCapability(
    "platform.manage_businesses",
    "No tienes permisos para administrar negocios",
  );
}

export async function requirePlatformLicenseManager() {
  return requirePlatformCapability(
    "platform.manage_business_licenses",
    "No tienes permisos para administrar licencias de negocios",
  );
}
