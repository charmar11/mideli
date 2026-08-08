"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import type { Profile, StaffMember } from "@/types/database";
import type { PaymentAuthorizer } from "@/types/payments";

type StaffRole = Profile["role"];
type ActionResult = { success: boolean; error: string | null };

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
    const { currentRole, adminClient } = await requireAdmin();
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
    const { userId: currentUserId, currentRole, adminClient } =
      await requireAdmin();

    if (!validateRole(role)) {
      return { success: false, error: "El rol seleccionado no es válido" };
    }

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
    const { userId: currentUserId, currentRole, adminClient } =
      await requireAdmin();

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
    const { currentRole, adminClient } = await requireAdmin();
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
    const { userId: currentUserId, currentRole, adminClient } =
      await requireAdmin();

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
    await requireAdmin();
    const adminClient = createAdminClient();

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
