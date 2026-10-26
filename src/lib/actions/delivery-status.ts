"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  finalOrderStatusForPayment,
  validDeliveryTransition,
} from "@/lib/whatsapp/delivery-lifecycle";
import type { BusinessContextRow } from "@/types/multibusiness";
import type { Order } from "@/types/database";

type DeliveryStatus = NonNullable<Order["delivery_status"]>;
type DeliveryOperation = "searching_driver" | "driver_on_way" | "customer_received";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_STAFF_ROLES = new Set(["owner", "admin", "waiter", "kitchen", "supervisor"]);

type AuthorizedOrder = {
  order: Pick<Order, "id" | "business_id" | "status" | "type" | "delivery_status" | "payment_status" | "channel_conversation_id">;
  actorId: string;
};

async function authorizeDeliveryOrder(orderId: string): Promise<
  | { success: true; data: AuthorizedOrder }
  | { success: false; error: string }
> {
  if (!UUID_PATTERN.test(orderId)) {
    return { success: false, error: "El pedido no es válido." };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { success: false, error: "Tu sesión expiró. Inicia sesión nuevamente." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active) {
    return { success: false, error: "Esta cuenta está desactivada." };
  }

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,business_id,status,type,delivery_status,payment_status,channel_conversation_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) {
    return { success: false, error: "No se encontró el pedido." };
  }
  if (order.type !== "domicilio") {
    return { success: false, error: "Este pedido no corresponde a un domicilio." };
  }

  if (order.business_id) {
    const [contextResult, licenseResult] = await Promise.all([
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    if (contextResult.error || licenseResult.error) {
      return { success: false, error: "No se pudo verificar tu acceso al negocio." };
    }

    const context = ((contextResult.data ?? []) as BusinessContextRow[]).find(
      (business) => business.business_id === order.business_id,
    );
    const licenseAvailable = ((licenseResult.data ?? []) as Array<{
      business_id: string;
      is_available: boolean;
    }>).some(
      (license) => license.business_id === order.business_id && license.is_available,
    );
    if (!context || context.business_lifecycle_status !== "active" || !licenseAvailable) {
      return { success: false, error: "Este negocio no está disponible." };
    }
    if (
      !context.capability_codes.includes("business.operate_orders") &&
      !context.capability_codes.includes("organization.operate_orders")
    ) {
      return { success: false, error: "No tienes permiso para operar pedidos en este negocio." };
    }
  } else if (!LEGACY_STAFF_ROLES.has(profile.role)) {
    return { success: false, error: "No tienes permiso para operar este pedido." };
  }

  return {
    success: true,
    data: { order, actorId: auth.user.id },
  };
}

async function recordDeliveryAudit(
  actorId: string,
  orderId: string,
  previousStatus: DeliveryStatus,
  nextStatus: DeliveryStatus,
) {
  const { error } = await createAdminClient().from("whatsapp_admin_audit").insert({
    actor_id: actorId,
    action: `delivery_${nextStatus}`,
    entity_type: "order",
    entity_id: orderId,
    metadata: { previous_status: previousStatus, next_status: nextStatus, origin: "manual" },
  });
  if (error) console.warn("El reparto cambió, pero no se pudo guardar su auditoría.");
}

async function advanceDeliveryStatus(orderId: string, nextStatus: DeliveryOperation) {
  const authorization = await authorizeDeliveryOrder(orderId);
  if (!authorization.success) return authorization;

  const { order, actorId } = authorization.data;
  if (order.status !== "ready") {
    return { success: false as const, error: "El pedido debe estar listo antes de actualizar el reparto." };
  }

  const previousStatus = (order.delivery_status ?? "pending") as DeliveryStatus;
  const transition = validDeliveryTransition(previousStatus, nextStatus);
  if (transition === "invalid") {
    return { success: false as const, error: "El estado del reparto cambió. Actualiza los pedidos e intenta de nuevo." };
  }
  if (transition === "noop") {
    return { success: true as const, stateChanged: false };
  }

  const admin = createAdminClient();
  let query = admin
    .from("orders")
    .update({
      delivery_status: nextStatus,
      ...(nextStatus === "customer_received"
        ? { status: finalOrderStatusForPayment(order.payment_status) }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "ready");
  query = order.business_id
    ? query.eq("business_id", order.business_id)
    : query.is("business_id", null);
  query = order.delivery_status === null
    ? query.is("delivery_status", null)
    : query.eq("delivery_status", previousStatus);
  const { data: updated, error } = await query.select("id").maybeSingle();
  if (error || !updated) {
    return { success: false as const, error: "El reparto cambió en otro dispositivo. Actualiza e intenta de nuevo." };
  }

  await recordDeliveryAudit(actorId, orderId, previousStatus, nextStatus);
  if (nextStatus === "customer_received" && order.channel_conversation_id) {
    const { error: conversationError } = await admin
      .from("channel_conversations")
      .update({ status: "closed", closed_at: new Date().toISOString(), bot_enabled: false })
      .eq("id", order.channel_conversation_id);
    if (conversationError) console.warn("La entrega terminó, pero no se cerró su conversación relacionada.");
  }

  return { success: true as const, stateChanged: true };
}

export async function startDeliverySearchAction(orderId: string) {
  try {
    return await advanceDeliveryStatus(orderId, "searching_driver");
  } catch {
    return { success: false as const, error: "No se pudo iniciar la búsqueda de repartidor." };
  }
}

export async function markDeliveryDriverOnWayAction(orderId: string) {
  try {
    return await advanceDeliveryStatus(orderId, "driver_on_way");
  } catch {
    return { success: false as const, error: "No se pudo actualizar el reparto." };
  }
}

export async function finalizeDeliveryAction(orderId: string) {
  try {
    return await advanceDeliveryStatus(orderId, "customer_received");
  } catch {
    return { success: false as const, error: "No se pudo finalizar la entrega." };
  }
}
