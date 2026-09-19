"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";
import type { Profile, StaffMember } from "@/types/database";
import type { BusinessContextRow } from "@/types/multibusiness";
import type { PaymentAuthorizer } from "@/types/payments";

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
  status: "active" | "inactive" | "revoked";
  deactivated_at?: string | null;
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
    .neq("status", "revoked")
    .limit(1);

  if (scope.mode === "business") {
    query = query
      .eq("scope_type", "business")
      .eq("organization_id", scope.organizationId)
      .eq("business_id", scope.businessId);
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
      "id,user_id,scope_type,organization_id,business_id,role_code,status,deactivated_at"
    )
    .neq("status", "revoked");

  if (scope.mode === "business") {
    membershipQuery = membershipQuery
      .eq("scope_type", "business")
      .eq("organization_id", scope.organizationId)
      .eq("business_id", scope.businessId)
      .neq("role_code", "business_owner");
  } else {
    membershipQuery = membershipQuery
      .eq("scope_type", "organization")
      .eq("organization_id", scope.organizationId)
      .is("business_id", null)
      .eq("role_code", "global_waiter");
  }

  const { data: membershipRows, error: membershipError } = await membershipQuery;
  if (membershipError) throw new Error("No se pudo cargar el personal del alcance actual");

  const memberships = (membershipRows ?? []) as StaffMembershipRow[];
  if (memberships.length === 0) return [];

  const userIds = Array.from(new Set(memberships.map((membership) => membership.user_id)));
  const [{ data: profiles, error: profilesError }, { data: authData, error: authError }] =
    await Promise.all([
      scope.adminClient.from("profiles").select("*").in("id", userIds),
      scope.adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (profilesError) throw new Error(profilesError.message);
  if (authError) throw new Error(authError.message);

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

function validateRole(role: string): role is StaffRole {
  return ["owner", "admin", "waiter", "kitchen", "supervisor"].includes(role);
}

function getFriendlyAuthError(message: string) {
  if (message.toLowerCase().includes("already been registered")) {
    return "Ese correo ya está registrado";
  }

  return message;
}

export async function createUserAction(input: {
  email: string;
  password: string;
  fullName: string;
  role: StaffRole;
}): Promise<ActionResult> {
  try {
    const scope = await resolveStaffScope();
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();

    if (!email || !email.includes("@")) {
      return { success: false, error: "Escribe un correo válido" };
    }

    if (fullName.length < 2) {
      return { success: false, error: "Escribe el nombre completo" };
    }

    if (input.password.length < 6) {
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

      const { data, error } = await scope.adminClient.auth.admin.createUser({
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

      const profileRole = profileRoleForModernRole(modernRole);
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

      const rpcName =
        modernRole === "global_waiter"
          ? "create_global_waiter_membership"
          : "create_business_staff_membership";
      const rpcArgs =
        modernRole === "global_waiter"
          ? {
              p_user_id: data.user.id,
              p_organization_id: scope.organizationId,
              p_must_change_password: true,
            }
          : {
              p_user_id: data.user.id,
              p_business_id: scope.businessId,
              p_role_code: modernRole,
              p_must_change_password: true,
            };
      const { error: membershipError } = await scope.supabase.rpc(rpcName, rpcArgs);

      if (membershipError) {
        await scope.adminClient.auth.admin.deleteUser(data.user.id);
        return {
          success: false,
          error: `No se pudo asignar el acceso: ${membershipError.message}`,
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

      const { error: roleError } = await scope.supabase.rpc(
        "update_business_staff_membership_role",
        {
          p_membership_id: targetMembership.id,
          p_role_code: modernRole,
        }
      );
      if (roleError) return { success: false, error: roleError.message };

      const { error: profileError } = await scope.adminClient
        .from("profiles")
        .update({ role: profileRoleForModernRole(modernRole) })
        .eq("id", userId);
      if (profileError) return { success: false, error: profileError.message };

      return { success: true, error: null };
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
    await requireAdmin();
    if (!/^\d{4}$/.test(pin)) {
      return { success: false, error: "El PIN debe tener exactamente 4 dígitos" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_staff_authorization_pin", {
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
