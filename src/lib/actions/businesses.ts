"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  BUSINESS_OWNER_CAPABILITY_CODES,
  type BusinessOwnerCapabilityCode,
} from "@/lib/business-capabilities";
import { getBusinessBrandColors, isHexColor } from "@/lib/business-branding";
import { requirePlatformManager } from "@/lib/server/platform-manager";
import type { BusinessLifecycleStatus } from "@/types/multibusiness";

const OPERATIONAL_OWNER_CAPABILITIES: BusinessOwnerCapabilityCode[] = [
  "business.operate_orders",
  "business.update_preparation",
  "business.charge_orders",
  "business.manage_cash",
];

export interface ManagedBusiness {
  id: string;
  organization_id: string;
  organization_name: string;
  slug: string;
  display_name: string;
  timezone: string;
  brand_logo_path: string | null;
  brand_primary_color: string | null;
  brand_accent_color: string | null;
  lifecycle_status: BusinessLifecycleStatus;
  created_at: string;
  updated_at: string;
  owner_name: string | null;
  /** Active capabilities granted to the business owner's membership. */
  capability_codes: string[];
}

export interface ManagedOrganization {
  id: string;
  name: string;
  lifecycle_status: string;
}

export interface BusinessOwnerTransferCandidate {
  userId: string;
  fullName: string;
  login: string | null;
  assignments: string[];
}

type ActionResult = { success: boolean; error: string | null };
type CreateBusinessResult = ActionResult & { businessId?: string };

const LIFECYCLE_STATUSES = new Set<BusinessLifecycleStatus>([
  "draft",
  "active",
  "paused",
  "archived",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeLogin(value: string) {
  return value.trim().toLowerCase();
}

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validateOwnerLogin(value: string) {
  return /^[a-z0-9](?:[a-z0-9._-]{1,38}[a-z0-9])?$/.test(value);
}

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already been registered")) {
    return "Ese usuario ya está registrado";
  }
  return "No se pudo crear la cuenta del dueño";
}

function safeActionError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (
    message === "No autenticado" ||
    message === "No tienes permisos para administrar negocios"
  ) {
    return message;
  }
  return fallback;
}

function parseBusinessOwnerCapabilities(value: unknown): {
  codes: BusinessOwnerCapabilityCode[];
  error: string | null;
} {
  const requested = Array.isArray(value)
    ? value.filter((code): code is string => typeof code === "string")
    : [...BUSINESS_OWNER_CAPABILITY_CODES];
  const uniqueCodes = [...new Set(requested)];
  const unknownCode = uniqueCodes.find(
    (code) => !BUSINESS_OWNER_CAPABILITY_CODES.includes(code as BusinessOwnerCapabilityCode),
  );

  if (unknownCode) {
    return { codes: [], error: "Hay un permiso de negocio no reconocido" };
  }
  if (!uniqueCodes.includes("business.manage_catalog")) {
    return { codes: [], error: "El dueño debe conservar el permiso de Catálogo" };
  }

  return {
    codes: uniqueCodes as BusinessOwnerCapabilityCode[],
    error: null,
  };
}

async function synchronizeOwnerCapabilities(input: {
  admin: ReturnType<typeof createAdminClient>;
  actorId: string;
  membershipId: string;
  organizationId: string;
  businessId: string;
  capabilityCodes: BusinessOwnerCapabilityCode[];
}) {
  const desiredCodes = new Set(input.capabilityCodes);
  const { data: currentRows, error: currentRowsError } = await input.admin
    .from("membership_capabilities")
    .select("id,capability_code,revoked_at")
    .eq("membership_id", input.membershipId)
    .in("capability_code", [...BUSINESS_OWNER_CAPABILITY_CODES]);

  if (currentRowsError) throw new Error("No se pudieron leer los permisos del dueño");

  const rowsByCode = new Map<string, { id: string; capability_code: string; revoked_at: string | null }>();
  for (const row of currentRows ?? []) {
    if (!rowsByCode.has(row.capability_code) || row.revoked_at === null) {
      rowsByCode.set(row.capability_code, row);
    }
  }

  const now = new Date().toISOString();
  const grants = input.capabilityCodes
    .filter((code) => rowsByCode.get(code)?.revoked_at !== null)
    .filter((code) => !rowsByCode.has(code) || rowsByCode.get(code)?.revoked_at !== null)
    .map((capabilityCode) => ({
      membership_id: input.membershipId,
      capability_code: capabilityCode,
      organization_id: input.organizationId,
      business_id: input.businessId,
      granted_by: input.actorId,
      grant_reason: "Permisos seleccionados desde la administración de plataforma",
    }));

  if (grants.length > 0) {
    const { error: grantError } = await input.admin
      .from("membership_capabilities")
      .insert(grants);
    if (grantError) throw new Error("No se pudieron activar los permisos seleccionados");
  }

  const activeRowsToRevoke = (currentRows ?? []).filter(
    (row) => row.revoked_at === null && !desiredCodes.has(row.capability_code as BusinessOwnerCapabilityCode),
  );
  if (activeRowsToRevoke.length > 0) {
    const { error: revokeError } = await input.admin
      .from("membership_capabilities")
      .update({
        revoked_by: input.actorId,
        revoked_at: now,
        revocation_reason: "Módulo desactivado desde la administración de plataforma",
      })
      .in("id", activeRowsToRevoke.map((row) => row.id));
    if (revokeError) throw new Error("No se pudieron desactivar los permisos seleccionados");
  }

  const disabledRows = BUSINESS_OWNER_CAPABILITY_CODES
    .filter((code) => !desiredCodes.has(code))
    .filter((code) => !(currentRows ?? []).some((row) => row.capability_code === code));
  if (disabledRows.length > 0) {
    const { error: disabledInsertError } = await input.admin
      .from("membership_capabilities")
      .insert(
        disabledRows.map((capabilityCode) => ({
          membership_id: input.membershipId,
          capability_code: capabilityCode,
          organization_id: input.organizationId,
          business_id: input.businessId,
          granted_by: input.actorId,
          grant_reason: "Permiso registrado como desactivado desde la administración de plataforma",
          revoked_by: input.actorId,
          revoked_at: now,
          revocation_reason: "Módulo desactivado desde la administración de plataforma",
        })),
      );
    if (disabledInsertError) throw new Error("No se pudieron guardar los permisos desactivados");
  }
}

export async function listManagedBusinessesAction(): Promise<{
  businesses: ManagedBusiness[];
  organizations: ManagedOrganization[];
  error: string | null;
}> {
  try {
    const { admin } = await requirePlatformManager();
    const [businessesResult, organizationsResult, ownersResult] = await Promise.all([
      admin
        .from("businesses")
        .select(
          "id,organization_id,slug,display_name,timezone,brand_logo_path,brand_primary_color,brand_accent_color,lifecycle_status,created_at,updated_at,organizations(name)"
        )
        .order("display_name"),
      admin
        .from("organizations")
        .select("id,name,lifecycle_status")
        .neq("lifecycle_status", "retired")
        .order("name"),
      admin
        .from("memberships")
        .select("id,business_id,user_id,status")
        .eq("scope_type", "business")
        .eq("role_code", "business_owner")
        .eq("status", "active"),
    ]);

    if (businessesResult.error || organizationsResult.error || ownersResult.error) {
      return {
        businesses: [],
        organizations: [],
        error: "No se pudo cargar la administración de negocios",
      };
    }

    const ownerRows = ownersResult.data ?? [];
    const ownerMembershipIds = ownerRows.map((owner) => owner.id).filter(Boolean);
    const ownerCapabilitiesResult = ownerMembershipIds.length
      ? await admin
          .from("membership_capabilities")
          .select("membership_id,business_id,capability_code,revoked_at")
          .in("membership_id", ownerMembershipIds)
          .is("revoked_at", null)
      : { data: [], error: null };
    if (ownerCapabilitiesResult.error) {
      return {
        businesses: [],
        organizations: [],
        error: "No se pudieron cargar los módulos de los negocios",
      };
    }

    const capabilityCodesByBusiness = new Map<string, string[]>();
    for (const capability of ownerCapabilitiesResult.data ?? []) {
      if (!capability.business_id) continue;
      const current = capabilityCodesByBusiness.get(capability.business_id) ?? [];
      if (!current.includes(capability.capability_code)) {
        current.push(capability.capability_code);
      }
      capabilityCodesByBusiness.set(capability.business_id, current);
    }

    const ownerIds = Array.from(
      new Set(ownerRows.map((row) => row.user_id).filter(Boolean))
    );
    const { data: profiles, error: profilesError } = ownerIds.length
      ? await admin.from("profiles").select("id,full_name").in("id", ownerIds)
      : { data: [], error: null };
    if (profilesError) {
      return {
        businesses: [],
        organizations: [],
        error: "No se pudo cargar a los dueños de los negocios",
      };
    }

    const profileNames = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.full_name ?? null])
    );
    const ownersByBusiness = new Map<string, string | null>();
    for (const owner of ownerRows) {
      if (owner.business_id && owner.status === "active") {
        ownersByBusiness.set(owner.business_id, profileNames.get(owner.user_id) ?? null);
      }
    }

    const businesses = (businessesResult.data ?? []).map((business) => {
      const organization = Array.isArray(business.organizations)
        ? business.organizations[0]
        : business.organizations;
      return {
        id: business.id,
        organization_id: business.organization_id,
        organization_name: organization?.name ?? "Organización sin nombre",
        slug: business.slug,
        display_name: business.display_name,
        timezone: business.timezone,
        brand_logo_path: business.brand_logo_path,
        brand_primary_color: business.brand_primary_color,
        brand_accent_color: business.brand_accent_color,
        lifecycle_status: business.lifecycle_status as BusinessLifecycleStatus,
        created_at: business.created_at,
        updated_at: business.updated_at,
        owner_name: ownersByBusiness.get(business.id) ?? null,
        capability_codes: capabilityCodesByBusiness.get(business.id) ?? [],
      } satisfies ManagedBusiness;
    });

    return {
      businesses,
      organizations: (organizationsResult.data ?? []) as ManagedOrganization[],
      error: null,
    };
  } catch (error) {
    return {
      businesses: [],
      organizations: [],
      error: safeActionError(error, "No se pudo cargar la administración"),
    };
  }
}

export async function createBusinessWithOwnerAction(input: {
  organizationId: string;
  slug: string;
  displayName: string;
  ownerLogin: string;
  ownerName: string;
  ownerPassword: string;
  capabilityCodes?: string[];
  brandPrimaryColor?: string;
  brandAccentColor?: string;
}): Promise<CreateBusinessResult> {
  let createdUserId: string | null = null;
  let createdBusinessId: string | null = null;
  let createdMembershipId: string | null = null;

  try {
    const { actorId, admin } = await requirePlatformManager();
    const organizationId = input.organizationId.trim();
    const slug = normalizeSlug(input.slug);
    const displayName = input.displayName.trim();
    const ownerLogin = normalizeLogin(input.ownerLogin);
    const ownerName = input.ownerName.trim();
    const defaultBrand = getBusinessBrandColors(slug);
    const brandPrimaryColor = input.brandPrimaryColor?.trim() || defaultBrand.primary;
    const brandAccentColor = input.brandAccentColor?.trim() || defaultBrand.accent;
    const parsedCapabilities = parseBusinessOwnerCapabilities(input.capabilityCodes);

    if (parsedCapabilities.error) {
      return { success: false, error: parsedCapabilities.error };
    }

    if (!isUuid(organizationId)) {
      return { success: false, error: "Selecciona una organización válida" };
    }
    if (!slug || slug.length < 2) {
      return { success: false, error: "Escribe un identificador válido para el negocio" };
    }
    if (displayName.length < 2 || displayName.length > 80) {
      return { success: false, error: "El nombre debe tener entre 2 y 80 caracteres" };
    }
    if (!isHexColor(brandPrimaryColor) || !isHexColor(brandAccentColor)) {
      return { success: false, error: "Elige colores válidos para la identidad del negocio" };
    }
    if (!validateOwnerLogin(ownerLogin)) {
      return { success: false, error: "El usuario debe usar sólo letras, números, punto, guion o guion bajo" };
    }
    if (ownerName.length < 2 || ownerName.length > 100) {
      return { success: false, error: "Escribe el nombre del dueño" };
    }
    if (input.ownerPassword.length < 8 || input.ownerPassword.length > 100) {
      return { success: false, error: "La contraseña debe tener entre 8 y 100 caracteres" };
    }

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("id,lifecycle_status")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationError || !organization || organization.lifecycle_status !== "active") {
      return { success: false, error: "La organización no está disponible" };
    }

    const { data: duplicate } = await admin
      .from("businesses")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", slug)
      .maybeSingle();
    if (duplicate) return { success: false, error: "Ya existe un negocio con ese identificador" };

    const authEmail = `${ownerLogin}@mideli.com`;
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: authEmail,
      password: input.ownerPassword,
      email_confirm: true,
      user_metadata: { full_name: ownerName, login_alias: ownerLogin },
    });
    if (authError || !authData.user) {
      return { success: false, error: friendlyAuthError(authError?.message ?? "") };
    }
    createdUserId = authData.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: createdUserId,
        full_name: ownerName,
        role: "owner",
        is_active: true,
        deactivated_at: null,
      },
      { onConflict: "id" }
    );
    if (profileError) throw new Error("No se pudo preparar el perfil del dueño");

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .insert({
        organization_id: organizationId,
        slug,
        display_name: displayName,
        timezone: "America/Hermosillo",
        brand_primary_color: brandPrimaryColor,
        brand_accent_color: brandAccentColor,
        lifecycle_status: "draft",
        created_by: actorId,
      })
      .select("id")
      .single();
    if (businessError || !business) throw new Error("No se pudo crear el negocio");
    createdBusinessId = business.id;

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .insert({
        user_id: createdUserId,
        scope_type: "business",
        organization_id: organizationId,
        business_id: createdBusinessId,
        role_code: "business_owner",
        status: "active",
        must_change_password: true,
        created_by: actorId,
      })
      .select("id")
      .single();
    if (membershipError || !membership) throw new Error("No se pudo asignar el acceso del dueño");
    createdMembershipId = membership.id;

    await synchronizeOwnerCapabilities({
      admin,
      actorId,
      membershipId: membership.id,
      organizationId,
      businessId: business.id,
      capabilityCodes: parsedCapabilities.codes,
    });

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_user_id: actorId,
      organization_id: organizationId,
      business_id: createdBusinessId,
      action: "created",
      entity_type: "business",
      entity_id: createdBusinessId,
      reason: "Negocio creado desde la administración de plataforma",
      metadata: {
        owner_user_id: createdUserId,
        owner_login: ownerLogin,
        lifecycle_status: "draft",
        brand_primary_color: brandPrimaryColor,
        brand_accent_color: brandAccentColor,
      },
    });
    if (auditError) throw new Error("No se pudo registrar la auditoría del negocio");
    if (!createdBusinessId) throw new Error("No se confirmó el identificador del negocio creado");

    return { success: true, error: null, businessId: createdBusinessId };
  } catch (error) {
    try {
      const admin = createAdminClient();
      if (createdMembershipId) {
        await admin.from("membership_capabilities").delete().eq("membership_id", createdMembershipId);
        await admin.from("memberships").delete().eq("id", createdMembershipId);
      }
      if (createdBusinessId) {
        await admin.from("audit_events").delete().eq("entity_id", createdBusinessId);
        await admin.from("businesses").delete().eq("id", createdBusinessId);
      }
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    } catch {
      // Do not expose cleanup details. The original operation remains failed
      // and the server logs retain the actionable failure context.
    }
    return {
      success: false,
      error: safeActionError(error, "No se pudo crear el negocio"),
    };
  }
}

export async function createPlatformAdministratorAction(input: {
  login: string;
  name: string;
  password: string;
}): Promise<ActionResult> {
  let createdUserId: string | null = null;
  let createdMembershipId: string | null = null;
  let previousMembershipIds: string[] = [];
  let previousCapabilityIds: string[] = [];
  let previousAccessTouched = false;

  try {
    const { actorId, admin } = await requirePlatformManager();
    const login = normalizeLogin(input.login);
    const name = input.name.trim();

    if (!validateOwnerLogin(login)) {
      return { success: false, error: "El usuario debe usar sólo letras, números, punto, guion o guion bajo" };
    }
    if (name.length < 2 || name.length > 100) {
      return { success: false, error: "Escribe el nombre del administrador" };
    }
    if (input.password.length < 8 || input.password.length > 100) {
      return { success: false, error: "La contraseña debe tener entre 8 y 100 caracteres" };
    }

    const { data: previousMemberships, error: previousMembershipsError } = await admin
      .from("memberships")
      .select("id")
      .eq("user_id", actorId)
      .eq("scope_type", "platform")
      .eq("status", "active");
    if (previousMembershipsError || !previousMemberships?.length) {
      return { success: false, error: "No se encontró el acceso de plataforma actual" };
    }
    previousMembershipIds = previousMemberships.map((membership) => membership.id);

    const { data: previousCapabilities, error: previousCapabilitiesError } = await admin
      .from("membership_capabilities")
      .select("id")
      .in("membership_id", previousMembershipIds)
      .eq("capability_code", "platform.manage_businesses")
      .is("revoked_at", null);
    if (previousCapabilitiesError) {
      return { success: false, error: "No se pudo preparar el traspaso de plataforma" };
    }
    previousCapabilityIds = (previousCapabilities ?? []).map((capability) => capability.id);

    const authEmail = `${login}@mideli.com`;
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: authEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: name, login_alias: login },
    });
    if (authError || !authData.user) {
      return { success: false, error: friendlyAuthError(authError?.message ?? "") };
    }
    createdUserId = authData.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: createdUserId,
        full_name: name,
        role: "admin",
        is_active: true,
        deactivated_at: null,
      },
      { onConflict: "id" }
    );
    if (profileError) throw new Error("No se pudo preparar el perfil del administrador");

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .insert({
        user_id: createdUserId,
        scope_type: "platform",
        role_code: "platform_admin",
        status: "active",
        must_change_password: false,
        created_by: actorId,
      })
      .select("id")
      .single();
    if (membershipError || !membership) throw new Error("No se pudo asignar el acceso de plataforma");
    createdMembershipId = membership.id;

    const { data: platformCapability } = await admin
      .from("capabilities")
      .select("code")
      .eq("code", "platform.manage_businesses")
      .eq("scope_type", "platform")
      .eq("is_active", true)
      .maybeSingle();
    if (!platformCapability) throw new Error("La capacidad de plataforma no está disponible");

    const { error: capabilityError } = await admin.from("membership_capabilities").insert({
      membership_id: createdMembershipId,
      capability_code: platformCapability.code,
      granted_by: actorId,
      grant_reason: "Administrador de plataforma creado desde Negocios",
    });
    if (capabilityError) throw new Error("No se pudo asignar la capacidad de plataforma");

    const now = new Date().toISOString();
    previousAccessTouched = true;
    const { error: revokeCapabilityError } = previousCapabilityIds.length
      ? await admin
          .from("membership_capabilities")
          .update({
            revoked_at: now,
            revoked_by: actorId,
            revocation_reason: "Acceso transferido al administrador de plataforma independiente",
          })
          .in("id", previousCapabilityIds)
      : { error: null };
    if (revokeCapabilityError) throw new Error("No se pudo retirar el acceso anterior");

    const { error: revokeMembershipError } = await admin
      .from("memberships")
      .update({
        status: "inactive",
        deactivated_by: actorId,
        deactivated_at: now,
        deactivation_reason: "Acceso transferido al administrador de plataforma independiente",
      })
      .in("id", previousMembershipIds);
    if (revokeMembershipError) throw new Error("No se pudo retirar el acceso anterior");

    const { error: auditError } = await admin.from("audit_events").insert([
      {
        actor_user_id: actorId,
        action: "platform_access_granted",
        entity_type: "membership",
        entity_id: createdMembershipId,
        reason: "Se creó un administrador de plataforma independiente",
        metadata: { login_alias: login },
      },
      {
        actor_user_id: actorId,
        action: "platform_access_transferred",
        entity_type: "membership",
        entity_id: previousMembershipIds[0],
        reason: "El dueño de Mideli conserva únicamente su acceso de negocio",
        metadata: { replacement_membership_id: createdMembershipId },
      },
    ]);
    if (auditError) throw new Error("No se pudo registrar el traspaso de plataforma");

    return { success: true, error: null };
  } catch (error) {
    try {
      const admin = createAdminClient();
      if (previousAccessTouched && previousMembershipIds.length) {
        await admin
          .from("memberships")
          .update({
            status: "active",
            deactivated_by: null,
            deactivated_at: null,
            deactivation_reason: null,
          })
          .in("id", previousMembershipIds);
        if (previousCapabilityIds.length) {
          await admin
            .from("membership_capabilities")
            .update({ revoked_at: null, revoked_by: null, revocation_reason: null })
            .in("id", previousCapabilityIds);
        }
      }
      if (createdMembershipId) {
        await admin.from("membership_capabilities").delete().eq("membership_id", createdMembershipId);
        await admin.from("memberships").delete().eq("id", createdMembershipId);
        await admin.from("audit_events").delete().eq("entity_id", createdMembershipId);
      }
      if (createdUserId) {
        await admin.from("profiles").delete().eq("id", createdUserId);
        await admin.auth.admin.deleteUser(createdUserId);
      }
    } catch {
      // Do not expose cleanup details. The original operation remains failed.
    }
    return {
      success: false,
      error: safeActionError(error, "No se pudo crear el administrador de plataforma"),
    };
  }
}

export async function updateBusinessDetailsAction(input: {
  businessId: string;
  slug: string;
  displayName: string;
  timezone: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
}): Promise<ActionResult> {
  try {
    const { actorId, admin } = await requirePlatformManager();
    const businessId = input.businessId.trim();
    const slug = normalizeSlug(input.slug);
    const displayName = input.displayName.trim();
    const timezone = input.timezone.trim();
    const brandPrimaryColor = input.brandPrimaryColor.trim();
    const brandAccentColor = input.brandAccentColor.trim();

    if (!isUuid(businessId)) {
      return { success: false, error: "El negocio seleccionado no es válido" };
    }
    if (!slug || slug.length < 2) {
      return { success: false, error: "Escribe un identificador válido para el negocio" };
    }
    if (displayName.length < 2 || displayName.length > 80) {
      return { success: false, error: "El nombre debe tener entre 2 y 80 caracteres" };
    }
    if (!isValidTimezone(timezone)) {
      return { success: false, error: "Selecciona una zona horaria válida" };
    }
    if (!isHexColor(brandPrimaryColor) || !isHexColor(brandAccentColor)) {
      return { success: false, error: "Elige colores válidos para la identidad del negocio" };
    }

    const { data: current, error: currentError } = await admin
      .from("businesses")
      .select("id,organization_id,slug,display_name,timezone,brand_primary_color,brand_accent_color,lifecycle_status")
      .eq("id", businessId)
      .maybeSingle();
    if (currentError || !current) {
      return { success: false, error: "No se encontró el negocio" };
    }
    if (current.lifecycle_status === "retired") {
      return { success: false, error: "Un negocio retirado no se puede editar" };
    }

    const { data: duplicate, error: duplicateError } = await admin
      .from("businesses")
      .select("id")
      .eq("organization_id", current.organization_id)
      .eq("slug", slug)
      .neq("id", businessId)
      .maybeSingle();
    if (duplicateError) {
      return { success: false, error: "No se pudo validar el identificador" };
    }
    if (duplicate) {
      return { success: false, error: "Ya existe un negocio con ese identificador" };
    }

    const changedFields = [
      current.slug !== slug ? "slug" : null,
      current.display_name !== displayName ? "display_name" : null,
      current.timezone !== timezone ? "timezone" : null,
      current.brand_primary_color !== brandPrimaryColor ? "brand_primary_color" : null,
      current.brand_accent_color !== brandAccentColor ? "brand_accent_color" : null,
    ].filter((field): field is string => Boolean(field));

    if (changedFields.length === 0) {
      return { success: true, error: null };
    }

    const { error: updateError } = await admin
      .from("businesses")
      .update({
        slug,
        display_name: displayName,
        timezone,
        brand_primary_color: brandPrimaryColor,
        brand_accent_color: brandAccentColor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);
    if (updateError) {
      return { success: false, error: "No se pudo guardar el negocio" };
    }

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_user_id: actorId,
      organization_id: current.organization_id,
      business_id: businessId,
      action: "updated",
      entity_type: "business",
      entity_id: businessId,
      reason: "Datos del negocio actualizados desde la administración de plataforma",
      metadata: { changed_fields: changedFields },
    });
    if (auditError) {
      return { success: false, error: "El negocio cambió, pero no se pudo registrar la auditoría" };
    }

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: safeActionError(error, "No se pudo editar el negocio"),
    };
  }
}

export async function updateBusinessOwnerCapabilitiesAction(input: {
  businessId: string;
  capabilityCodes?: string[];
}): Promise<ActionResult> {
  try {
    const { actorId, admin } = await requirePlatformManager();
    const businessId = input.businessId.trim();
    const parsedCapabilities = parseBusinessOwnerCapabilities(input.capabilityCodes);

    if (parsedCapabilities.error) {
      return { success: false, error: parsedCapabilities.error };
    }
    if (!isUuid(businessId)) {
      return { success: false, error: "El negocio seleccionado no es válido" };
    }

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id,organization_id,lifecycle_status")
      .eq("id", businessId)
      .maybeSingle();
    if (businessError || !business) {
      return { success: false, error: "No se encontró el negocio" };
    }
    if (business.lifecycle_status === "retired") {
      return { success: false, error: "Un negocio retirado no se puede editar" };
    }

    const { data: ownerMembership, error: ownerMembershipError } = await admin
      .from("memberships")
      .select("id")
      .eq("business_id", businessId)
      .eq("scope_type", "business")
      .eq("role_code", "business_owner")
      .eq("status", "active")
      .maybeSingle();
    if (ownerMembershipError || !ownerMembership) {
      return { success: false, error: "El negocio no tiene un dueño activo" };
    }

    await synchronizeOwnerCapabilities({
      admin,
      actorId,
      membershipId: ownerMembership.id,
      organizationId: business.organization_id,
      businessId,
      capabilityCodes: parsedCapabilities.codes,
    });

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_user_id: actorId,
      organization_id: business.organization_id,
      business_id: businessId,
      action: "owner_capabilities_updated",
      entity_type: "membership",
      entity_id: ownerMembership.id,
      reason: "Permisos del dueño actualizados desde la administración de plataforma",
      metadata: { capability_codes: parsedCapabilities.codes },
    });
    if (auditError) {
      return { success: false, error: "Los permisos cambiaron, pero no se pudo registrar la auditoría" };
    }

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: safeActionError(error, "No se pudieron actualizar los permisos del dueño"),
    };
  }
}

export async function listBusinessOwnerTransferCandidatesAction(
  businessIdInput: string,
): Promise<{ candidates: BusinessOwnerTransferCandidate[]; error: string | null }> {
  try {
    const { admin } = await requirePlatformManager();
    const businessId = businessIdInput.trim();
    if (!isUuid(businessId)) {
      return { candidates: [], error: "El negocio seleccionado no es válido" };
    }

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id,organization_id")
      .eq("id", businessId)
      .maybeSingle();
    if (businessError || !business) {
      return { candidates: [], error: "No se encontró el negocio" };
    }

    const [{ data: memberships, error: membershipsError }, { data: businesses, error: businessesError }, { data: platformMemberships, error: platformError }, { data: currentOwner, error: currentOwnerError }] = await Promise.all([
      admin
        .from("memberships")
        .select("user_id,scope_type,role_code,business_id,staff_role_id")
        .eq("organization_id", business.organization_id)
        .eq("status", "active"),
      admin
        .from("businesses")
        .select("id,display_name")
        .eq("organization_id", business.organization_id),
      admin
        .from("memberships")
        .select("user_id")
        .eq("scope_type", "platform")
        .eq("status", "active"),
      admin
        .from("memberships")
        .select("user_id")
        .eq("scope_type", "business")
        .eq("business_id", businessId)
        .eq("role_code", "business_owner")
        .eq("status", "active")
        .maybeSingle(),
    ]);
    if (membershipsError || businessesError || platformError || currentOwnerError || !currentOwner) {
      return { candidates: [], error: "No se pudieron consultar las cuentas disponibles" };
    }

    const platformUserIds = new Set((platformMemberships ?? []).map((membership) => membership.user_id));
    const assignableMemberships = (memberships ?? []).filter(
      (membership) =>
        membership.user_id !== currentOwner.user_id && !platformUserIds.has(membership.user_id),
    );
    const userIds = Array.from(new Set(assignableMemberships.map((membership) => membership.user_id)));
    if (userIds.length === 0) return { candidates: [], error: null };

    const roleIds = Array.from(
      new Set(
        assignableMemberships
          .map((membership) => membership.staff_role_id)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    );
    const [profilesResult, authResult, rolesResult] = await Promise.all([
      admin.from("profiles").select("id,full_name").in("id", userIds).eq("is_active", true),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      roleIds.length
        ? admin.from("business_staff_roles").select("id,name").in("id", roleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error || authResult.error || rolesResult.error) {
      return { candidates: [], error: "No se pudieron consultar los perfiles del equipo" };
    }

    const businessNameById = new Map((businesses ?? []).map((row) => [row.id, row.display_name]));
    const roleNameById = new Map((rolesResult.data ?? []).map((role) => [role.id, role.name]));
    const authEmailById = new Map(authResult.data.users.map((user) => [user.id, user.email ?? null]));
    const assignmentsByUser = new Map<string, Set<string>>();
    for (const membership of assignableMemberships) {
      let assignment: string | null = null;
      if (membership.scope_type === "organization" && membership.role_code === "global_waiter") {
        assignment = "Mesera global";
      } else if (membership.scope_type === "business" && membership.business_id) {
        const localRole = membership.staff_role_id
          ? roleNameById.get(membership.staff_role_id)
          : membership.role_code === "business_owner"
            ? "Dueño/a"
            : membership.role_code === "local_waiter"
              ? "Mesero/a"
              : membership.role_code === "local_kitchen"
                ? "Cocina"
                : membership.role_code === "local_supervisor"
                  ? "Supervisor/a"
                  : "Personal";
        assignment = `${localRole} · ${businessNameById.get(membership.business_id) ?? "Negocio"}`;
      }
      if (!assignment) continue;
      const current = assignmentsByUser.get(membership.user_id) ?? new Set<string>();
      current.add(assignment);
      assignmentsByUser.set(membership.user_id, current);
    }

    return {
      candidates: (profilesResult.data ?? [])
        .filter((profile) => profile.id !== "")
        .map((profile) => ({
          userId: profile.id,
          fullName: profile.full_name || "Sin nombre",
          login: authEmailById.get(profile.id) ?? null,
          assignments: Array.from(assignmentsByUser.get(profile.id) ?? []),
        }))
        .sort((left, right) => left.fullName.localeCompare(right.fullName, "es")),
      error: null,
    };
  } catch (error) {
    return {
      candidates: [],
      error: safeActionError(error, "No se pudieron cargar las cuentas candidatas"),
    };
  }
}

export async function transferBusinessOwnerAction(input: {
  businessId: string;
  newOwnerUserId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    await requirePlatformManager();
    const businessId = input.businessId.trim();
    const newOwnerUserId = input.newOwnerUserId.trim();
    const reason = input.reason.trim();
    if (!isUuid(businessId) || !isUuid(newOwnerUserId) || reason.length < 4 || reason.length > 240) {
      return { success: false, error: "Selecciona una cuenta y escribe un motivo de al menos 4 caracteres" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("transfer_business_owner", {
      p_business_id: businessId,
      p_new_owner_user_id: newOwnerUserId,
      p_reason: reason,
    });
    if (error) {
      return {
        success: false,
        error: error.message.includes("dueño") || error.message.includes("permiso")
          ? error.message
          : "No se pudo transferir el dueño. No se cambiaron las cuentas.",
      };
    }
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: safeActionError(error, "No se pudo transferir el dueño"),
    };
  }
}

export async function updateBusinessLifecycleAction(input: {
  businessId: string;
  status: BusinessLifecycleStatus;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const { actorId, admin } = await requirePlatformManager();
    const businessId = input.businessId.trim();
    const reason = input.reason?.trim() ?? "";
    if (!isUuid(businessId) || !LIFECYCLE_STATUSES.has(input.status)) {
      return { success: false, error: "El negocio o estado no es válido" };
    }
    if (["paused", "archived"].includes(input.status) && reason.length < 4) {
      return { success: false, error: "Escribe un motivo para pausar o archivar" };
    }

    const { data: current, error: currentError } = await admin
      .from("businesses")
      .select("id,organization_id,lifecycle_status")
      .eq("id", businessId)
      .maybeSingle();
    if (currentError || !current) return { success: false, error: "No se encontró el negocio" };
    if (current.lifecycle_status === "retired") {
      return { success: false, error: "Un negocio retirado no se puede reactivar" };
    }

    const now = new Date().toISOString();
    const { data: ownerMembership, error: ownerMembershipError } = await admin
      .from("memberships")
      .select("id")
      .eq("business_id", businessId)
      .eq("scope_type", "business")
      .eq("role_code", "business_owner")
      .eq("status", "active")
      .maybeSingle();
    if (ownerMembershipError) {
      return { success: false, error: "No se pudo validar al dueño del negocio" };
    }

    if (input.status === "active") {
      if (!ownerMembership) {
        return { success: false, error: "El negocio no tiene un dueño activo" };
      }

      const { data: operationalCapabilities, error: capabilityCatalogError } =
        await admin
          .from("capabilities")
          .select("code")
          .in("code", [...OPERATIONAL_OWNER_CAPABILITIES])
          .eq("scope_type", "business")
          .eq("is_active", true);
      if (capabilityCatalogError) {
        return { success: false, error: "No se pudieron preparar los permisos del negocio" };
      }

      const { data: existingCapabilities, error: existingCapabilitiesError } =
        await admin
          .from("membership_capabilities")
          .select("capability_code,revoked_at,revocation_reason")
          .eq("membership_id", ownerMembership.id)
          .in("capability_code", [...OPERATIONAL_OWNER_CAPABILITIES]);
      if (existingCapabilitiesError) {
        return { success: false, error: "No se pudieron preparar los permisos del negocio" };
      }

      const existingCodes = new Set(
        (existingCapabilities ?? [])
          .filter((capability) => capability.revoked_at === null)
          .map((capability) => capability.capability_code),
      );
      const explicitlyDisabledCodes = new Set(
        (existingCapabilities ?? [])
          .filter(
            (capability) =>
              capability.revoked_at !== null &&
              !capability.revocation_reason?.startsWith("Permisos operativos pausados por estado"),
          )
          .map((capability) => capability.capability_code),
      );
      const missingCapabilities = (operationalCapabilities ?? [])
        .filter(
          (capability) =>
            !existingCodes.has(capability.code) &&
            !explicitlyDisabledCodes.has(capability.code),
        )
        .map((capability) => ({
          membership_id: ownerMembership.id,
          capability_code: capability.code as BusinessOwnerCapabilityCode,
          organization_id: current.organization_id,
          business_id: businessId,
          granted_by: actorId,
          grant_reason: "Permisos operativos otorgados al activar el negocio",
        }));

      if (missingCapabilities.length > 0) {
        const { error: grantError } = await admin
          .from("membership_capabilities")
          .insert(missingCapabilities);
        if (grantError) {
          return { success: false, error: "No se pudieron preparar los permisos del negocio" };
        }
      }
    } else if (ownerMembership) {
      const { error: revokeError } = await admin
        .from("membership_capabilities")
        .update({
          revoked_by: actorId,
          revoked_at: now,
          revocation_reason: `Permisos operativos pausados por estado ${input.status}${
            reason ? `: ${reason}` : ""
          }`,
        })
        .eq("membership_id", ownerMembership.id)
        .in("capability_code", [...OPERATIONAL_OWNER_CAPABILITIES])
        .is("revoked_at", null);
      if (revokeError) {
        return { success: false, error: "No se pudieron pausar los permisos operativos" };
      }
    }

    const { error: updateError } = await admin
      .from("businesses")
      .update({
        lifecycle_status: input.status,
        paused_at: input.status === "paused" ? now : null,
        archived_at: input.status === "archived" ? now : null,
      })
      .eq("id", businessId);
    if (updateError) return { success: false, error: "No se pudo actualizar el estado del negocio" };

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_user_id: actorId,
      organization_id: current.organization_id,
      business_id: businessId,
      action: `lifecycle_${input.status}`,
      entity_type: "business",
      entity_id: businessId,
      reason: reason || `Estado cambiado a ${input.status}`,
      metadata: { previous_status: current.lifecycle_status, next_status: input.status },
    });
    if (auditError) return { success: false, error: "El estado cambió, pero no se pudo registrar la auditoría" };

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: safeActionError(error, "No se pudo actualizar el negocio"),
    };
  }
}
