"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";
import type { Profile, StaffMember } from "@/types/database";
import type { BusinessContextRow } from "@/types/multibusiness";
import type { PaymentAuthorizer } from "@/types/payments";
import {
  filterVisibleBusinessStaffMemberships,
  STAFF_ROLE_CAPABILITY_OPTIONS,
  type BusinessStaffRole,
  type StaffRoleCapabilityGroup,
} from "@/lib/staff-roles";

type StaffRole = Profile["role"];
type ActionResult = { success: boolean; error: string | null };
type StaffManagementMode = "legacy" | "business" | "organization" | "unavailable";
type ModernStaffRole = "local_waiter" | "local_kitchen" | "local_supervisor" | "global_waiter";
type StaffScope = {
  mode: StaffManagementMode;
  userId: string;
  currentRole: StaffRole;
  organizationId: string | null;
  businessId: string | null;
  businessName: string | null;
  capabilityCodes: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
  adminClient: ReturnType<typeof createAdminClient>;
};
type StaffMembershipRow = {
  id: string;
  user_id: string;
  scope_type: "platform" | "organization" | "business";
  organization_id: string | null;
  business_id: string | null;
  role_code: string;
  staff_role_id?: string | null;
  status: "active" | "inactive" | "revoked";
  deactivated_at?: string | null;
};

export type GlobalWaiterBusinessAccessBusiness = {
  id: string;
  slug: string;
  displayName: string;
  lifecycleStatus: "draft" | "active" | "paused" | "archived" | "retired";
  licenseAvailable: boolean;
};

export type GlobalWaiterBusinessAccessGrant = {
  membershipId: string;
  businessId: string;
  canOperate: boolean;
  canCharge: boolean;
};

export type OrganizationBusinessTeamMember = {
  membershipId: string;
  fullName: string;
  roleName: string;
  roleDescription: string;
  capabilityCodes: string[];
  status: "active" | "inactive";
};

export type OrganizationBusinessTeam = {
  businessId: string;
  businessName: string;
  members: OrganizationBusinessTeamMember[];
};

export type StaffRoleCapability = {
  code: string;
  label: string;
  description: string;
  group: StaffRoleCapabilityGroup;
};

const MISSING_CONTEXT_CODES = new Set(["PGRST202", "42883", "42P01"]);

function isMissingContextError(error: { code?: string | null } | null) {
  return Boolean(error?.code && MISSING_CONTEXT_CODES.has(error.code));
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Falta la configuración segura de Supabase en el servidor");
  }

  return createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active) {
    throw new Error("Esta cuenta está desactivada");
  }

  if (profile.role !== "owner" && profile.role !== "admin") {
    throw new Error("Sin permisos de administrador");
  }

  return {
    userId: user.id,
    currentRole: profile.role as StaffRole,
    adminClient: createAdminClient(),
  };
}

async function resolveStaffScope(): Promise<StaffScope> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No autenticado");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.is_active) {
    throw new Error("Esta cuenta está desactivada");
  }

  const { data: contextRows, error: contextError } = await supabase.rpc(
    "get_my_multibusiness_context"
  );
  if (contextError) {
    if (isMissingContextError(contextError)) {
      if (profile.role !== "owner" && profile.role !== "admin") {
        throw new Error("Sin permisos de administrador");
      }
      return {
        mode: "legacy",
        userId: user.id,
        currentRole: profile.role as StaffRole,
        organizationId: null,
        businessId: null,
        businessName: null,
        capabilityCodes: [],
        supabase,
        adminClient: createAdminClient(),
      };
    }
    throw new Error("No se pudo cargar el contexto de negocios");
  }

  const contexts = (contextRows ?? []) as BusinessContextRow[];
  const selected = await getSelectedBusinessContext(supabase);
  const selectedContext =
    contexts.find((context) => context.business_id === selected.businessId) ??
    contexts[0] ??
    null;
  const globalManagerContext = contexts.find((context) =>
    context.capability_codes.includes("organization.manage_global_waiters")
  );

  if (selectedContext?.capability_codes.includes("business.manage_staff")) {
    return {
      mode: "business",
      userId: user.id,
      currentRole: profile.role as StaffRole,
      organizationId: selectedContext.organization_id,
      businessId: selectedContext.business_id,
      businessName: selectedContext.business_display_name,
      capabilityCodes: selectedContext.capability_codes,
      supabase,
      adminClient: createAdminClient(),
    };
  }

  if (globalManagerContext) {
    return {
      mode: "organization",
      userId: user.id,
      currentRole: profile.role as StaffRole,
      organizationId: globalManagerContext.organization_id,
      businessId: null,
      businessName: globalManagerContext.organization_name,
      capabilityCodes: globalManagerContext.capability_codes,
      supabase,
      adminClient: createAdminClient(),
    };
  }

  return {
    mode: "unavailable",
    userId: user.id,
    currentRole: profile.role as StaffRole,
    organizationId: selectedContext?.organization_id ?? null,
    businessId: selectedContext?.business_id ?? null,
    businessName: selectedContext?.business_display_name ?? null,
    capabilityCodes: selectedContext?.capability_codes ?? [],
    supabase,
    adminClient: createAdminClient(),
  };
}

function modernRoleForInput(
  role: StaffRole,
  mode: Exclude<StaffManagementMode, "legacy" | "unavailable">
): ModernStaffRole | null {
  if (mode === "organization") {
    return role === "waiter" ? "global_waiter" : null;
  }

  if (role === "waiter") return "local_waiter";
  if (role === "kitchen") return "local_kitchen";
  if (role === "supervisor") return "local_supervisor";
  return null;
}

function profileRoleForModernRole(role: ModernStaffRole): StaffRole {
  if (role === "global_waiter" || role === "local_waiter") return "waiter";
  if (role === "local_kitchen") return "kitchen";
  return "supervisor";
}

async function findManagedMembership(scope: StaffScope, userId: string) {
  if (scope.mode !== "business" && scope.mode !== "organization") return null;

  let query = scope.supabase
    .from("memberships")
    .select("id,user_id,scope_type,organization_id,business_id,role_code,status")
    .eq("user_id", userId)
    .neq("status", "revoked");

  if (scope.mode === "business") {
    query = query
      .eq("scope_type", "business")
      .eq("organization_id", scope.organizationId)
      .eq("business_id", scope.businessId)
      .in("role_code", ["local_waiter", "local_kitchen", "local_supervisor", "business_staff"]);
  } else {
    query = query
      .eq("scope_type", "organization")
      .eq("organization_id", scope.organizationId)
      .is("business_id", null)
      .eq("role_code", "global_waiter");
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("No se pudo localizar la membresía del empleado");
  return data;
}

function profileRoleForMembershipRole(
  membershipRole: string,
  fallback: StaffRole
): StaffRole {
  if (membershipRole === "global_waiter" || membershipRole === "local_waiter") {
    return "waiter";
  }
  if (membershipRole === "local_kitchen") return "kitchen";
  if (membershipRole === "local_supervisor") return "supervisor";
  return fallback;
}

async function listScopedProfiles(scope: StaffScope): Promise<StaffMember[]> {
  if (scope.mode !== "business" && scope.mode !== "organization") return [];

  let membershipQuery = scope.supabase
    .from("memberships")
    .select(
      "id,user_id,scope_type,organization_id,business_id,role_code,staff_role_id,status,deactivated_at"
    )
    .neq("status", "revoked");

  if (scope.mode === "business") {
    membershipQuery = membershipQuery
      .eq("scope_type", "business")
      .eq("organization_id", scope.organizationId)
      .eq("business_id", scope.businessId);
  } else {
    membershipQuery = membershipQuery
      .eq("scope_type", "organization")
      .eq("organization_id", scope.organizationId)
      .is("business_id", null)
      .eq("role_code", "global_waiter");
  }

  const { data: membershipRows, error: membershipError } = await membershipQuery;
  if (membershipError) throw new Error("No se pudo cargar el personal del alcance actual");

  const scopedMemberships = (membershipRows ?? []) as StaffMembershipRow[];
  const memberships = scope.mode === "business"
    ? filterVisibleBusinessStaffMemberships(scopedMemberships, scope.userId)
    : scopedMemberships;
  if (memberships.length === 0) return [];

  const userIds = Array.from(new Set(memberships.map((membership) => membership.user_id)));
  const [{ data: profiles, error: profilesError }, { data: authData, error: authError }] =
    await Promise.all([
      scope.adminClient.from("profiles").select("*").in("id", userIds),
      scope.adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (profilesError) throw new Error(profilesError.message);
  if (authError) throw new Error(authError.message);

  const staffRoleIds = Array.from(
    new Set(
      memberships
        .map((membership) => membership.staff_role_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const [staffRolesResult, roleCapabilitiesResult] = staffRoleIds.length
    ? await Promise.all([
        scope.adminClient
          .from("business_staff_roles")
          .select("id,name,description,is_system,system_code")
          .in("id", staffRoleIds),
        scope.adminClient
          .from("business_staff_role_capabilities")
          .select("role_id,capability_code")
          .in("role_id", staffRoleIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (staffRolesResult.error || roleCapabilitiesResult.error) {
    throw new Error("No se pudieron cargar los rangos locales");
  }
  const staffRoleById = new Map(
    (staffRolesResult.data ?? []).map((role) => [role.id, role]),
  );
  const capabilitiesByRoleId = new Map<string, string[]>();
  for (const row of roleCapabilitiesResult.data ?? []) {
    const codes = capabilitiesByRoleId.get(row.role_id) ?? [];
    codes.push(row.capability_code);
    capabilitiesByRoleId.set(row.role_id, codes);
  }

  const profileById = new Map(
    (profiles as Profile[]).map((profile) => [profile.id, profile])
  );
  const authById = new Map(authData.users.map((user) => [user.id, user]));

  const scopedProfiles = memberships.map((membership): StaffMember | null => {
      const profile = profileById.get(membership.user_id);
      if (!profile) return null;
      const authUser = authById.get(profile.id);
      return {
        ...profile,
        role: profileRoleForMembershipRole(membership.role_code, profile.role),
        is_active: membership.status === "active",
        deactivated_at: membership.deactivated_at ?? profile.deactivated_at,
        email: authUser?.email ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        banned_until: authUser?.banned_until ?? null,
        membership_id: membership.id,
        membership_scope_type: membership.scope_type,
        membership_role_code: membership.role_code,
        staff_role_id: membership.staff_role_id ?? null,
        membership_role_name: membership.staff_role_id
          ? staffRoleById.get(membership.staff_role_id)?.name ?? null
          : null,
        membership_role_capability_codes: membership.staff_role_id
          ? capabilitiesByRoleId.get(membership.staff_role_id) ?? []
          : [],
        membership_status: membership.status,
        business_id: membership.business_id,
      } as StaffMember;
    });

  return scopedProfiles
    .filter((profile): profile is StaffMember => profile !== null)
    .sort((left, right) => {
      if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
      return left.full_name.localeCompare(right.full_name, "es");
    });
}

export async function getStaffManagementContextAction(): Promise<{
  mode: StaffManagementMode;
  businessId: string | null;
  organizationId: string | null;
  businessName: string | null;
}> {
  try {
    const scope = await resolveStaffScope();
    return {
      mode: scope.mode,
      businessId: scope.businessId,
      organizationId: scope.organizationId,
      businessName: scope.businessName,
    };
  } catch {
    return {
      mode: "unavailable",
      businessId: null,
      organizationId: null,
      businessName: null,
    };
  }
}

export async function listBusinessStaffRolesAction(): Promise<{
  roles: BusinessStaffRole[];
  capabilities: StaffRoleCapability[];
  error: string | null;
}> {
  try {
    const scope = await resolveStaffScope();
    if (scope.mode !== "business" || !scope.businessId) {
      return {
        roles: [],
        capabilities: [],
        error: "Los rangos locales se administran desde el negocio correspondiente",
      };
    }
    if (!scope.capabilityCodes.includes("business.manage_staff")) {
      return { roles: [], capabilities: [], error: "No tienes permiso para administrar el equipo" };
    }

    const [rolesResult, capabilitiesResult] = await Promise.all([
      scope.adminClient
        .from("business_staff_roles")
        .select("id,business_id,role_key,name,description,is_system,system_code,is_active")
        .eq("business_id", scope.businessId)
        .eq("is_active", true)
        .order("is_system", { ascending: false })
        .order("name"),
      scope.adminClient
        .from("business_staff_role_capabilities")
        .select("role_id,capability_code")
        .eq("business_id", scope.businessId),
    ]);

    if (rolesResult.error || capabilitiesResult.error) {
      return { roles: [], capabilities: [], error: "No se pudieron cargar los rangos del negocio" };
    }

    const roleCapabilities = new Map<string, string[]>();
    for (const row of capabilitiesResult.data ?? []) {
      const current = roleCapabilities.get(row.role_id) ?? [];
      current.push(row.capability_code);
      roleCapabilities.set(row.role_id, current);
    }
    const capabilities = STAFF_ROLE_CAPABILITY_OPTIONS.filter(
      (capability) =>
        scope.capabilityCodes.includes(capability.code) ||
        (capability.code.startsWith("business.") &&
          ["business.open_cash", "business.close_cash"].includes(capability.code) &&
          scope.capabilityCodes.includes("business.manage_cash")),
    );
    const delegableCodes = new Set(capabilities.map((capability) => capability.code));
    const roles = (rolesResult.data ?? []).map((role) => {
      const roleCodes = roleCapabilities.get(role.id) ?? [];
      return {
        id: role.id,
        businessId: role.business_id,
        key: role.role_key,
        name: role.name,
        description: role.description,
        isSystem: role.is_system,
        systemCode: role.system_code,
        isActive: role.is_active,
        capabilities: roleCodes,
        assignable: roleCodes.every((code) => delegableCodes.has(code)),
      } satisfies BusinessStaffRole & { assignable: boolean };
    });

    return { roles, capabilities, error: null };
  } catch {
    return { roles: [], capabilities: [], error: "No se pudieron cargar los rangos del negocio" };
  }
}

export async function saveBusinessStaffRoleAction(input: {
  roleId?: string | null;
  name: string;
  description: string;
  capabilityCodes: string[];
}): Promise<{ success: boolean; roleId?: string; error: string | null }> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    (input.roleId && !uuidPattern.test(input.roleId)) ||
    typeof input.name !== "string" ||
    typeof input.description !== "string" ||
    !Array.isArray(input.capabilityCodes) ||
    input.capabilityCodes.some((code) => typeof code !== "string")
  ) {
    return { success: false, error: "Los datos del rango no son válidos" };
  }

  try {
    const scope = await resolveStaffScope();
    if (scope.mode !== "business" || !scope.businessId) {
      return { success: false, error: "Selecciona un negocio para administrar sus rangos" };
    }
    const allowedCodes = new Set(
      STAFF_ROLE_CAPABILITY_OPTIONS.filter(
        (option) =>
          scope.capabilityCodes.includes(option.code) ||
          (["business.open_cash", "business.close_cash"].includes(option.code) &&
            scope.capabilityCodes.includes("business.manage_cash")),
      ).map((option) => option.code),
    );
    if (input.capabilityCodes.some((code) => !allowedCodes.has(code))) {
      return { success: false, error: "El rango incluye un permiso que no puedes delegar" };
    }

    const { data: roleId, error } = await scope.supabase.rpc("save_business_staff_role", {
      p_business_id: scope.businessId,
      p_role_id: input.roleId ?? null,
      p_name: input.name.trim(),
      p_description: input.description.trim(),
      p_capability_codes: [...new Set(input.capabilityCodes)],
    });
    if (error || !roleId) {
      return { success: false, error: "No se pudo guardar el rango. Verifica tus permisos e inténtalo de nuevo." };
    }
    return { success: true, roleId, error: null };
  } catch {
    return { success: false, error: "No se pudo guardar el rango" };
  }
}

export async function archiveBusinessStaffRoleAction(roleId: string): Promise<ActionResult> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(roleId)) return { success: false, error: "El rango no es válido" };
  try {
    const scope = await resolveStaffScope();
    if (scope.mode !== "business") return { success: false, error: "No tienes permiso para archivar rangos" };
    const { error } = await scope.supabase.rpc("archive_business_staff_role", { p_role_id: roleId });
    return error
      ? { success: false, error: "No se pudo archivar. Reasigna primero al personal que usa este rango." }
      : { success: true, error: null };
  } catch {
    return { success: false, error: "No se pudo archivar el rango" };
  }
}

export async function setBusinessStaffRoleAction(
  membershipId: string,
  roleId: string,
): Promise<ActionResult> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(membershipId) || !uuidPattern.test(roleId)) {
    return { success: false, error: "La asignación de rango no es válida" };
  }
  try {
    const scope = await resolveStaffScope();
    if (scope.mode !== "business") return { success: false, error: "Solo el negocio administra sus rangos locales" };
    const { error } = await scope.supabase.rpc("set_business_staff_membership_role", {
      p_membership_id: membershipId,
      p_role_id: roleId,
    });
    return error
      ? { success: false, error: "No se pudo asignar ese rango. Verifica que siga activo y pertenezca a este negocio." }
      : { success: true, error: null };
  } catch {
    return { success: false, error: "No se pudo asignar el rango" };
  }
}

export async function listGlobalWaiterBusinessAccessAction(): Promise<{
  businesses: GlobalWaiterBusinessAccessBusiness[];
  grants: GlobalWaiterBusinessAccessGrant[];
  error: string | null;
}> {
  try {
    const scope = await resolveStaffScope();
    if (scope.mode !== "organization" || !scope.organizationId) {
      return { businesses: [], grants: [], error: "No tienes permiso para administrar meseras globales" };
    }

    const [{ data: businesses, error: businessesError }, { data: memberships, error: membershipsError }, { data: licenseRows, error: licenseError }] = await Promise.all([
      scope.adminClient
        .from("businesses")
        .select("id,slug,display_name,lifecycle_status")
        .eq("organization_id", scope.organizationId)
        .neq("lifecycle_status", "archived")
        .neq("lifecycle_status", "retired")
        .order("display_name"),
      scope.adminClient
        .from("memberships")
        .select("id")
        .eq("scope_type", "organization")
        .eq("organization_id", scope.organizationId)
        .is("business_id", null)
        .eq("role_code", "global_waiter")
        .neq("status", "revoked"),
      scope.supabase.rpc("get_my_business_license_availability"),
    ]);

    if (businessesError || membershipsError || licenseError) {
      return { businesses: [], grants: [], error: "No se pudieron cargar los negocios y sus accesos" };
    }

    const businessIds = (businesses ?? []).map((business) => business.id);
    const membershipIds = (memberships ?? []).map((membership) => membership.id);
    const licenseByBusiness = new Map(
      ((licenseRows ?? []) as Array<{ business_id: string; is_available: boolean }>).map((license) => [
        license.business_id,
        license.is_available === true,
      ]),
    );
    const businessesWithLicense = (businesses ?? []).map((business) => ({
      id: business.id,
      slug: business.slug,
      displayName: business.display_name,
      lifecycleStatus: business.lifecycle_status as GlobalWaiterBusinessAccessBusiness["lifecycleStatus"],
      licenseAvailable: licenseByBusiness.get(business.id) === true,
    }));
    if (membershipIds.length === 0 || businessIds.length === 0) {
      return { businesses: businessesWithLicense, grants: [], error: null };
    }

    const { data: grantRows, error: grantsError } = await scope.adminClient
      .from("membership_capabilities")
      .select("membership_id,business_id,capability_code")
      .in("membership_id", membershipIds)
      .in("business_id", businessIds)
      .eq("organization_id", scope.organizationId)
      .in("capability_code", ["business.operate_orders", "business.charge_orders"])
      .is("revoked_at", null);
    if (grantsError) return { businesses: [], grants: [], error: "No se pudieron leer los accesos por negocio" };

    const grantsByTarget = new Map<string, GlobalWaiterBusinessAccessGrant>();
    for (const row of grantRows ?? []) {
      if (!row.business_id) continue;
      const key = `${row.membership_id}:${row.business_id}`;
      const current = grantsByTarget.get(key) ?? {
        membershipId: row.membership_id,
        businessId: row.business_id,
        canOperate: false,
        canCharge: false,
      };
      if (row.capability_code === "business.operate_orders") current.canOperate = true;
      if (row.capability_code === "business.charge_orders") current.canCharge = true;
      grantsByTarget.set(key, current);
    }
    return { businesses: businessesWithLicense, grants: [...grantsByTarget.values()], error: null };
  } catch {
    return { businesses: [], grants: [], error: "No se pudieron cargar los accesos por negocio" };
  }
}

/** Read-only organization view. Local staff assignment remains owner-managed. */
export async function listOrganizationBusinessTeamsAction(): Promise<{
  teams: OrganizationBusinessTeam[];
  error: string | null;
}> {
  try {
    const scope = await resolveStaffScope();
    const { data: contextRows, error: contextError } = await scope.supabase.rpc(
      "get_my_multibusiness_context",
    );
    const organizationContext = ((contextRows ?? []) as BusinessContextRow[]).find((context) =>
      context.capability_codes.includes("organization.manage_global_waiters"),
    );
    if (contextError || !organizationContext?.organization_id) {
      return { teams: [], error: "No tienes permiso para consultar los equipos locales" };
    }
    const organizationId = organizationContext.organization_id;

    const { data: businesses, error: businessesError } = await scope.adminClient
      .from("businesses")
      .select("id,display_name")
      .eq("organization_id", organizationId)
      .neq("lifecycle_status", "archived")
      .neq("lifecycle_status", "retired")
      .order("display_name");
    if (businessesError) {
      return { teams: [], error: "No se pudieron consultar los negocios" };
    }

    const businessRows = businesses ?? [];
    const businessIds = businessRows.map((business) => business.id);
    if (businessIds.length === 0) return { teams: [], error: null };

    const { data: memberships, error: membershipsError } = await scope.adminClient
      .from("memberships")
      .select("id,user_id,business_id,role_code,staff_role_id,status")
      .eq("scope_type", "business")
      .eq("organization_id", organizationId)
      .in("business_id", businessIds)
      .neq("status", "revoked")
      .neq("role_code", "business_owner");
    if (membershipsError) {
      return { teams: [], error: "No se pudieron consultar las asignaciones locales" };
    }

    const membershipRows = memberships ?? [];
    const userIds = Array.from(new Set(membershipRows.map((membership) => membership.user_id)));
    const roleIds = Array.from(
      new Set(
        membershipRows
          .map((membership) => membership.staff_role_id)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    );
    const [profilesResult, rolesResult, capabilitiesResult] = await Promise.all([
      userIds.length
        ? scope.adminClient.from("profiles").select("id,full_name").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      roleIds.length
        ? scope.adminClient
            .from("business_staff_roles")
            .select("id,name,description")
            .in("id", roleIds)
        : Promise.resolve({ data: [], error: null }),
      roleIds.length
        ? scope.adminClient
            .from("business_staff_role_capabilities")
            .select("role_id,capability_code")
            .in("role_id", roleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error || rolesResult.error || capabilitiesResult.error) {
      return { teams: [], error: "No se pudo cargar el detalle de los equipos" };
    }

    const profileById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const roleById = new Map(
      (rolesResult.data ?? []).map((role) => [role.id, role]),
    );
    const capabilityCodesByRoleId = new Map<string, string[]>();
    for (const row of capabilitiesResult.data ?? []) {
      const current = capabilityCodesByRoleId.get(row.role_id) ?? [];
      current.push(row.capability_code);
      capabilityCodesByRoleId.set(row.role_id, current);
    }
    const membersByBusinessId = new Map<string, OrganizationBusinessTeamMember[]>();

    for (const membership of membershipRows) {
      if (!membership.business_id) continue;
      const profile = profileById.get(membership.user_id);
      if (!profile) continue;
      const role = membership.staff_role_id
        ? roleById.get(membership.staff_role_id)
        : null;
      const legacyRoleNames: Record<string, string> = {
        local_waiter: "Mesero",
        local_kitchen: "Cocina",
        local_supervisor: "Supervisor",
      };
      const member: OrganizationBusinessTeamMember = {
        membershipId: membership.id,
        fullName: profile.full_name || "Sin nombre",
        roleName: role?.name ?? legacyRoleNames[membership.role_code] ?? "Rango sin configurar",
        roleDescription: role?.description ?? "",
        capabilityCodes: membership.staff_role_id
          ? capabilityCodesByRoleId.get(membership.staff_role_id) ?? []
          : [],
        status: membership.status === "active" ? "active" : "inactive",
      };
      const current = membersByBusinessId.get(membership.business_id) ?? [];
      current.push(member);
      membersByBusinessId.set(membership.business_id, current);
    }

    return {
      teams: businessRows.map((business) => ({
        businessId: business.id,
        businessName: business.display_name,
        members: (membersByBusinessId.get(business.id) ?? []).sort((left, right) =>
          left.fullName.localeCompare(right.fullName, "es"),
        ),
      })),
      error: null,
    };
  } catch {
    return { teams: [], error: "No se pudieron consultar los equipos locales" };
  }
}

export async function setGlobalWaiterBusinessAccessAction(input: {
  membershipId: string;
  businessId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(input.membershipId) || !uuidPattern.test(input.businessId) || typeof input.enabled !== "boolean") {
    return { success: false, error: "La asignación de negocio no es válida" };
  }
  try {
    const scope = await resolveStaffScope();
    if (scope.mode !== "organization") return { success: false, error: "Solo el Coordinador puede definir el alcance global" };
    const { error } = await scope.supabase.rpc("set_global_waiter_business_access", {
      p_membership_id: input.membershipId,
      p_business_id: input.businessId,
      p_enabled: input.enabled,
      p_reason: "Acceso por negocio actualizado desde Personal global",
    });
    return error
      ? { success: false, error: input.enabled ? "No se pudo habilitar. Revisa que el negocio esté activo y con licencia vigente." : "No se pudo retirar el acceso." }
      : { success: true, error: null };
  } catch {
    return { success: false, error: "No se pudo actualizar el acceso del negocio" };
  }
}

function validateRole(role: string): role is StaffRole {
  return ["owner", "admin", "waiter", "kitchen", "supervisor"].includes(role);
}

function getFriendlyAuthError(message: string) {
  if (message.toLowerCase().includes("already been registered")) {
    return "Ese correo ya está registrado";
  }

  return message;
}

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("No se pudo verificar la cuenta existente");
    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("No se pudo completar la búsqueda de la cuenta. Contacta al administrador.");
}

export async function createUserAction(input: {
  email: string;
  password?: string;
  fullName: string;
  role: StaffRole;
  staffRoleId?: string | null;
  existingAccount?: boolean;
}): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();

    if (!email || !email.includes("@")) {
      return { success: false, error: "Escribe un correo válido" };
    }

    const existingAccount = input.existingAccount === true;
    if (!existingAccount && fullName.length < 2) {
      return { success: false, error: "Escribe el nombre completo" };
    }

    if (!existingAccount && (input.password?.length ?? 0) < 6) {
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };
    }

    if (!validateRole(input.role)) {
      return { success: false, error: "El rol seleccionado no es válido" };
    }

    if (scope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      const modernRole = modernRoleForInput(input.role, scope.mode);
      if (!modernRole) {
        return {
          success: false,
          error:
            scope.mode === "organization"
              ? "El Coordinador solo puede crear meseras globales"
              : "El dueño puede crear meseros, cocina o supervisores locales; no otra cuenta de dueño",
        };
      }

      if (scope.mode === "business" && input.staffRoleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.staffRoleId)) {
        return { success: false, error: "El rango local seleccionado no es válido" };
      }

      let profileRole = profileRoleForModernRole(modernRole);
      if (scope.mode === "business" && input.staffRoleId) {
        const { data: selectedStaffRole, error: staffRoleError } = await scope.adminClient
          .from("business_staff_roles")
          .select("system_code")
          .eq("id", input.staffRoleId)
          .eq("business_id", scope.businessId)
          .eq("is_active", true)
          .maybeSingle();
        if (staffRoleError || !selectedStaffRole) {
          return { success: false, error: "El rango ya no está disponible en este negocio" };
        }
        if (selectedStaffRole.system_code === "local_kitchen") profileRole = "kitchen";
        if (selectedStaffRole.system_code === "local_supervisor") profileRole = "supervisor";
        if (selectedStaffRole.system_code === "local_waiter") profileRole = "waiter";
      }

      let targetUserId: string;
      let createdAuthUserId: string | null = null;
      if (existingAccount) {
        const existingUser = await findAuthUserByEmail(scope.adminClient, email);
        if (!existingUser) {
          return { success: false, error: "No se encontró una cuenta con ese correo. Revisa la dirección o crea un acceso nuevo." };
        }
        const { data: existingProfile, error: existingProfileError } = await scope.adminClient
          .from("profiles")
          .select("is_active")
          .eq("id", existingUser.id)
          .maybeSingle();
        if (existingProfileError || !existingProfile) {
          return { success: false, error: "No se pudo verificar el estado de la cuenta existente" };
        }
        if (!existingProfile.is_active) {
          return { success: false, error: "Esta cuenta está desactivada. Reactiva su acceso antes de vincularla." };
        }
        if (existingUser.banned_until && new Date(existingUser.banned_until).getTime() > Date.now()) {
          return { success: false, error: "Esta cuenta está suspendida y no puede iniciar sesión actualmente." };
        }
        targetUserId = existingUser.id;
      } else {
        const { data, error } = await scope.adminClient.auth.admin.createUser({
          email,
          password: input.password!,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (error || !data.user) {
          return {
            success: false,
            error: getFriendlyAuthError(error?.message ?? "Error al crear usuario"),
          };
        }
        targetUserId = data.user.id;
        createdAuthUserId = data.user.id;

        const { error: profileError } = await scope.adminClient.from("profiles").upsert(
          {
            id: data.user.id,
            full_name: fullName,
            role: profileRole,
            is_active: true,
            deactivated_at: null,
          },
          { onConflict: "id" }
        );

        if (profileError) {
          await scope.adminClient.auth.admin.deleteUser(data.user.id);
          return {
            success: false,
            error: `No se pudo guardar el perfil: ${profileError.message}`,
          };
        }
      }

      const rpcName =
        modernRole === "global_waiter"
          ? "create_global_waiter_membership"
          : input.staffRoleId
            ? "create_business_staff_membership_with_role"
            : "create_business_staff_membership";
      const rpcArgs =
        modernRole === "global_waiter"
          ? {
              p_user_id: targetUserId,
              p_organization_id: scope.organizationId,
              p_must_change_password: !existingAccount,
            }
          : input.staffRoleId
            ? {
                p_user_id: targetUserId,
                p_business_id: scope.businessId,
                p_role_id: input.staffRoleId,
                p_must_change_password: !existingAccount,
              }
          : {
              p_user_id: targetUserId,
              p_business_id: scope.businessId,
              p_role_code: modernRole,
              p_must_change_password: !existingAccount,
            };
      const { error: membershipError } = await scope.supabase.rpc(rpcName, rpcArgs);

      if (membershipError) {
        if (createdAuthUserId) {
          await scope.adminClient.auth.admin.deleteUser(createdAuthUserId);
        }
        return {
          success: false,
          error: membershipError.message.includes("ya tiene")
            ? "Esta cuenta ya tiene acceso en el negocio. Selecciónala desde el equipo para cambiar su rango."
            : "No se pudo asignar el acceso. Verifica que el rango pertenezca al negocio y tenga permisos delegables.",
        };
      }

      return { success: true, error: null };
    }

    const { currentRole, adminClient } = scope;

    if (input.role === "owner" && currentRole !== "owner") {
      return {
        success: false,
        error: "Solo el dueño puede crear otra cuenta de dueño",
      };
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error || !data.user) {
      return {
        success: false,
        error: getFriendlyAuthError(error?.message ?? "Error al crear usuario"),
      };
    }

    // The database trigger may create this profile during auth user creation.
    // Upsert keeps this action safe in both configurations and applies the
    // requested name and role without creating a duplicate primary key.
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: data.user.id,
        full_name: fullName,
        role: input.role,
        is_active: true,
        deactivated_at: null,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return {
        success: false,
        error: `No se pudo guardar el perfil: ${profileError.message}`,
      };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function updateUserRoleAction(
  userId: string,
  role: StaffRole
): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();

    if (!validateRole(role)) {
      return { success: false, error: "El rol seleccionado no es válido" };
    }

    if (scope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      if (scope.mode !== "business") {
        return {
          success: false,
          error: "El Coordinador administra altas y bajas globales, no roles locales",
        };
      }

      const targetMembership = await findManagedMembership(scope, userId);
      const modernRole = modernRoleForInput(role, "business");
      if (!targetMembership || !modernRole) {
        return { success: false, error: "El rol o el acceso local no es válido" };
      }
      const { data: targetRole, error: roleLookupError } = await scope.adminClient
        .from("business_staff_roles")
        .select("id")
        .eq("business_id", scope.businessId)
        .eq("system_code", modernRole)
        .eq("is_active", true)
        .maybeSingle();
      if (roleLookupError || !targetRole) {
        return { success: false, error: "No se encontró el rango integrado de este negocio" };
      }

      const { error: roleError } = await scope.supabase.rpc(
        "set_business_staff_membership_role",
        { p_membership_id: targetMembership.id, p_role_id: targetRole.id },
      );
      return roleError
        ? { success: false, error: "No se pudo asignar el rango seleccionado" }
        : { success: true, error: null };
    }

    const { userId: currentUserId, currentRole, adminClient } = scope;

    if (userId === currentUserId) {
      return { success: false, error: "No puedes cambiar tu propio rol" };
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return { success: false, error: "No se encontró al empleado" };
    }

    if ((target.role === "owner" || role === "owner") && currentRole !== "owner") {
      return {
        success: false,
        error: "Solo el dueño puede administrar cuentas de dueño",
      };
    }

    if (target.role === "owner" && target.is_active) {
      const { count } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);

      if (role !== "owner" && (count ?? 0) <= 1) {
        return {
          success: false,
          error: "Debe existir al menos un dueño activo",
        };
      }
    }

    const { error } = await adminClient
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    return error
      ? { success: false, error: error.message }
      : { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function deactivateUserAction(userId: string): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();

    if (scope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      const membership = await findManagedMembership(scope, userId);
      if (!membership) {
        return { success: false, error: "No se encontró el acceso de este empleado" };
      }
      const { error } = await scope.supabase.rpc(
        "set_multibusiness_membership_status",
        {
          p_membership_id: membership.id,
          p_status: "inactive",
          p_reason: "Acceso desactivado desde Personal",
        }
      );
      return error
        ? { success: false, error: error.message }
        : { success: true, error: null };
    }

    const { userId: currentUserId, currentRole, adminClient } = scope;

    if (userId === currentUserId) {
      return { success: false, error: "No puedes desactivar tu propia cuenta" };
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return { success: false, error: "No se encontró al empleado" };
    }

    if (!target.is_active) {
      return { success: true, error: null };
    }

    if (target.role === "owner" && currentRole !== "owner") {
      return {
        success: false,
        error: "Solo el dueño puede desactivar otra cuenta de dueño",
      };
    }

    if (target.role === "owner") {
      const { count } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);

      if ((count ?? 0) <= 1) {
        return {
          success: false,
          error: "Debe existir al menos un dueño activo",
        };
      }
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(
      userId,
      { ban_duration: "876000h" }
    );

    if (authError) {
      return { success: false, error: authError.message };
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq("id", userId);

    if (profileError) {
      await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
      return { success: false, error: profileError.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();

    if (scope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      const membership = await findManagedMembership(scope, userId);
      if (!membership) {
        return { success: false, error: "No se encontró el acceso de este empleado" };
      }
      const { error } = await scope.supabase.rpc(
        "set_multibusiness_membership_status",
        {
          p_membership_id: membership.id,
          p_status: "active",
          p_reason: null,
        }
      );
      return error
        ? { success: false, error: error.message }
        : { success: true, error: null };
    }

    const { currentRole, adminClient } = scope;
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return { success: false, error: "No se encontró al empleado" };
    }

    if (target.role === "owner" && currentRole !== "owner") {
      return {
        success: false,
        error: "Solo el dueño puede administrar cuentas de dueño",
      };
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(
      userId,
      { ban_duration: "none" }
    );

    if (authError) {
      return { success: false, error: authError.message };
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ is_active: true, deactivated_at: null })
      .eq("id", userId);

    if (profileError) {
      await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
      return { success: false, error: profileError.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function resetUserPasswordAction(
  userId: string,
  password: string
): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();

    if (scope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      const membership = await findManagedMembership(scope, userId);
      if (!membership) {
        return {
          success: false,
          error: "No puedes cambiar la contraseña de una cuenta fuera de tu alcance",
        };
      }

      if (scope.mode === "business") {
        const { count, error: membershipsError } = await scope.adminClient
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .neq("status", "revoked");
        if (membershipsError || (count ?? 0) > 1) {
          return {
            success: false,
            error: "Esta cuenta comparte acceso con otros negocios. Solo el titular puede cambiar su contraseña.",
          };
        }
      }

      if (password.length < 6) {
        return {
          success: false,
          error: "La contraseña debe tener al menos 6 caracteres",
        };
      }

      const { error } = await scope.adminClient.auth.admin.updateUserById(userId, {
        password,
      });

      return error
        ? { success: false, error: error.message }
        : { success: true, error: null };
    }

    const { currentRole, adminClient } = await requireAdmin();
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return {
        success: false,
        error: "No se encontró al empleado",
      };
    }

    if (target.role === "owner" && currentRole !== "owner") {
      return {
        success: false,
        error: "Solo el dueño puede administrar cuentas de dueño",
      };
    }

    if (password.length < 6) {
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  try {
    const staffScope = await resolveStaffScope();
    if (staffScope.mode === "business" || staffScope.mode === "organization") {
      return {
        success: false,
        error:
          "En el modelo multinegocio no se borra la cuenta global. Desactiva este acceso para conservar su historial.",
      };
    }
    if (staffScope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    const { userId: currentUserId, currentRole, adminClient } =
      staffScope;

    if (userId === currentUserId) {
      return { success: false, error: "No puedes eliminar tu propia cuenta" };
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return { success: false, error: "No se encontró al empleado" };
    }

    if (target.role === "owner") {
      if (currentRole !== "owner") {
        return {
          success: false,
          error: "Solo el dueño puede eliminar cuentas de dueño",
        };
      }

      const { count: activeOwnerCount } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);

      if ((activeOwnerCount ?? 0) <= 1) {
        return {
          success: false,
          error: "Debe existir al menos un dueño activo",
        };
      }
    }

    const [
      { count: orderCount },
      { count: statusLogCount },
      { count: paymentTransactionCount },
      { count: purchaseOrderCount },
      { count: receiptCount },
      { data: inventoryCounts, error: inventoryCountsError },
    ] = await Promise.all([
      adminClient
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId),
      adminClient
        .from("order_status_log")
        .select("id", { count: "exact", head: true })
        .eq("changed_by", userId),
      adminClient
        .from("payment_transactions")
        .select("id", { count: "exact", head: true })
        .eq("charged_by", userId),
      adminClient
        .from("inventory_purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId),
      adminClient
        .from("inventory_receipts")
        .select("id", { count: "exact", head: true })
        .eq("received_by", userId),
      adminClient
        .from("inventory_counts")
        .select("id,status")
        .eq("started_by", userId),
    ]);

    if (inventoryCountsError) {
      return {
        success: false,
        error: "No se pudo comprobar la actividad de inventario de esta persona",
      };
    }

    const blockingInventoryCounts = (inventoryCounts ?? []).filter(
      (count) => count.status !== "draft" && count.status !== "cancelled"
    );

    if (
      (orderCount ?? 0) > 0 ||
      (statusLogCount ?? 0) > 0 ||
      (paymentTransactionCount ?? 0) > 0 ||
      (purchaseOrderCount ?? 0) > 0 ||
      (receiptCount ?? 0) > 0 ||
      blockingInventoryCounts.length > 0
    ) {
      return {
        success: false,
        error:
          "No se puede eliminar porque esta persona tiene actividad operativa o historial. Usa Desactivar para conservarlo.",
      };
    }

    const removableInventoryCountIds = (inventoryCounts ?? [])
      .filter((count) => count.status === "draft" || count.status === "cancelled")
      .map((count) => count.id);

    if (removableInventoryCountIds.length > 0) {
      const { error: inventoryDeleteError } = await adminClient
        .from("inventory_counts")
        .delete()
        .in("id", removableInventoryCountIds);

      if (inventoryDeleteError) {
        return {
          success: false,
          error: "No se pudo limpiar el conteo de inventario incompleto",
        };
      }
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      return {
        success: false,
        error:
          error.message && error.message !== "{}"
            ? error.message
            : "Supabase aún conserva registros relacionados. Usa Desactivar o revisa la actividad de esta persona.",
      };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function listProfilesAction(): Promise<{
  profiles: StaffMember[];
  error: string | null;
}> {
  try {
    const scope = await resolveStaffScope();
    if (scope.mode === "unavailable") {
      return {
        profiles: [],
        error: "No tienes un alcance de personal asignado",
      };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      return { profiles: await listScopedProfiles(scope), error: null };
    }

    const adminClient = scope.adminClient;

    const [{ data: profiles, error: profilesError }, { data: authData, error: authError }] =
      await Promise.all([
        adminClient
          .from("profiles")
          .select("*")
          .order("is_active", { ascending: false })
          .order("created_at", { ascending: false }),
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

    if (profilesError) {
      return { profiles: [], error: profilesError.message };
    }

    if (authError) {
      return { profiles: [], error: authError.message };
    }

    const authUsersById = new Map(
      authData.users.map((user) => [user.id, user])
    );

    const staff = (profiles as Profile[]).map((profile) => {
      const authUser = authUsersById.get(profile.id);
      return {
        ...profile,
        email: authUser?.email ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        banned_until: authUser?.banned_until ?? null,
      } satisfies StaffMember;
    });

    return { profiles: staff, error: null };
  } catch (err) {
    return {
      profiles: [],
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function getCurrentUserRole(): Promise<Profile["role"] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  return data?.is_active ? data.role ?? null : null;
}

export async function listPaymentAuthorizersAction(): Promise<{
  authorizers: PaymentAuthorizer[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { authorizers: [], error: "Tu sesión expiró" };

    const { data: viewer } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();
    if (
      !viewer?.is_active ||
      !["owner", "admin", "waiter", "supervisor"].includes(viewer.role)
    ) {
      return { authorizers: [], error: "No tienes permiso para cobrar" };
    }

    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("id,full_name,role")
      .eq("is_active", true)
      .in("role", ["owner", "admin"])
      .order("role", { ascending: false })
      .order("full_name");

    if (error) return { authorizers: [], error: error.message };
    return {
      authorizers: (data ?? []) as PaymentAuthorizer[],
      error: null,
    };
  } catch (error) {
    return {
      authorizers: [],
      error: error instanceof Error ? error.message : "No se pudieron cargar los autorizadores",
    };
  }
}

export async function setStaffAuthorizationPinAction(
  userId: string,
  pin: string
): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();
    if (scope.mode === "unavailable") {
      return { success: false, error: "No tienes un alcance de personal asignado" };
    }

    if (!/^\d{4}$/.test(pin)) {
      return { success: false, error: "El PIN debe tener exactamente 4 dígitos" };
    }

    if (scope.mode === "business" || scope.mode === "organization") {
      let membership;
      if (scope.mode === "business" && userId === scope.userId) {
        const { data, error } = await scope.supabase
          .from("memberships")
          .select("id")
          .eq("user_id", scope.userId)
          .eq("scope_type", "business")
          .eq("organization_id", scope.organizationId)
          .eq("business_id", scope.businessId)
          .eq("role_code", "business_owner")
          .eq("status", "active")
          .maybeSingle();
        if (error) throw new Error("No se pudo validar la cuenta dueña del negocio");
        membership = data;
      } else {
        membership = await findManagedMembership(scope, userId);
      }

      if (!membership) {
        return {
          success: false,
          error: "No puedes cambiar el PIN de una cuenta fuera de tu alcance",
        };
      }
    }

    const { error } = await scope.supabase.rpc("set_staff_authorization_pin", {
      p_user_id: userId,
      p_pin: pin,
    });

    return error
      ? { success: false, error: error.message }
      : { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar el PIN",
    };
  }
}
