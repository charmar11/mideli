import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Order, OrderItem, CartItem, MenuItem } from "@/types/database";
import {
  ACTIVE_ORDER_ITEMS_SELECT,
  mapActiveOrderRows,
  type ActiveOrderRow,
} from "@/lib/active-order-query";
import {
  ACTIVE_ORDERS_TIMEOUT_MS,
  createRequestDeadline,
  getRealtimeReconnectDelay,
} from "@/lib/realtime-resilience";
import { normalizeWhatsappPosModifiers } from "@/lib/whatsapp/pos-draft";
import {
  getOrderableBusinessContexts,
  getOrderReadableBusinessContexts,
} from "@/lib/multibusiness/business-context-selection";
import { useBusinessContextStore } from "./business-context-store";
import type { MarketplaceOrderSelection } from "@/lib/marketplace-orders";

export interface OrderItemWithName extends OrderItem {
  menu_item_name?: string;
}

export interface OrderWithItems extends Order {
  items: OrderItemWithName[];
}

export interface PosDeliveryDetails {
  address: string;
  colony?: string | null;
  reference: string;
  fee: number;
  phone?: string;
  paymentMethod?: "efectivo" | "tarjeta" | "transferencia" | null;
  cashTendered?: number | null;
  whatsappStatusOptIn?: boolean;
  distanceMeters?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  scheduledFor?: string | null;
  kitchenReleaseAt?: string | null;
}

export type PosMarketplaceDetails = MarketplaceOrderSelection;

interface OrderState {
  activeOrders: OrderWithItems[];
  todayOrders: OrderWithItems[];
  menuItemsMap: Map<string, string>;
  menuItemsBusinessMap: Map<string, string>;
  loading: boolean;
  lastError: string | null;
  fetchActiveOrders: () => Promise<void>;
  createOrder: (
    items: CartItem[],
    orderType: "comedor" | "domicilio" | "para_llevar",
    notes?: string,
    tableNumber?: string,
    customerName?: string,
    tableId?: string,
    delivery?: PosDeliveryDetails,
    customerId?: string | null,
    customerPhone?: string | null,
    channelConversationId?: string | null,
    schedule?: { scheduledFor: string; kitchenReleaseAt: string } | null,
    creationKey?: string,
    businessCustomerId?: string | null,
    businessCustomerIds?: Record<string, string>,
    marketplace?: PosMarketplaceDetails | null,
  ) => Promise<{
    order: Order | null;
    orders?: Order[];
    error: string | null;
    attemptOutcome?: "committed" | "rejected" | "unknown";
  }>;
  updateOrderStatus: (
    orderId: string,
    status: Order["status"]
  ) => Promise<{ error: string | null }>;
  updateOrderWithItems: (
    orderId: string,
    items: CartItem[],
    tableNumber?: string,
    customerName?: string,
    tableId?: string,
    delivery?: PosDeliveryDetails,
    notes?: string,
    customerId?: string | null,
    customerPhone?: string | null,
    channelConversationId?: string | null,
    schedule?: { scheduledFor: string; kitchenReleaseAt: string } | null,
    businessCustomerId?: string | null
  ) => Promise<{ error: string | null }>;
  deleteOrder: (orderId: string) => Promise<{ error: string | null }>;
  markAsServed: (orderId: string) => Promise<{ error: string | null }>;
  cancelOrder: (orderId: string) => Promise<{ error: string | null }>;
  subscribeToOrders: () => () => void;
  setMenuItemsMap: (items: MenuItem[]) => void;
}

let activeOrdersRequest: Promise<void> | null = null;
const pendingOrderCreationKeys = new Map<string, string>();

function buildLocalOrder(
  order: Order,
  items: CartItem[],
  menuItemsMap: Map<string, string>
): OrderWithItems {
  const createdAt = order.created_at ?? new Date().toISOString();

  return {
    ...order,
    items: items.map((item) => ({
      id: `local-${item.id}`,
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.price,
      notes: item.notes,
      selected_modifiers: item.selected_modifiers,
      created_at: createdAt,
      menu_item_name: menuItemsMap.get(item.menu_item_id) ?? item.name,
    })),
  };
}

function isLiveStatus(status: Order["status"]) {
  return (
    status === "pending" ||
    status === "in_kitchen" ||
    status === "ready" ||
    status === "served"
  );
}

function calculateItemsTotal(items: CartItem[]) {
  return items.reduce((sum, item) => {
    const modifiersTotal = item.selected_modifiers.reduce(
      (modifierSum, modifier) => modifierSum + modifier.price,
      0
    );
    return sum + (item.price + modifiersTotal) * item.quantity;
  }, 0);
}

function orderLoadError(error: unknown, fallback: string) {
  if (error instanceof Error && error.name === "AbortError") {
    return "La conexión tardó demasiado. Conservamos los pedidos y volveremos a intentar.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function orderCreateError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("MARKETPLACE_PRODUCT_NOT_AVAILABLE")) {
    return "Uno de los productos ya no está disponible en esta plataforma. Revisa la selección antes de enviar.";
  }
  if (
    message.includes("BUSINESS_LICENSE_INACTIVE") ||
    message.includes("PLATFORM_EMERGENCY_SUSPENDED")
  ) {
    return "Uno de los negocios de la comanda ya no está disponible. Revisa el menú antes de enviar.";
  }
  return message || fallback;
}

function hasDefinitivePostgresError(error: { code?: string } | null) {
  return Boolean(error?.code && /^[0-9A-Z]{5}$/.test(error.code));
}

const OPTIONAL_ORDER_SELECT_COLUMNS = [
  "source_channel",
  "channel_conversation_id",
  "customer_id",
  "business_customer_id",
  "customer_phone",
  "whatsapp_status_opt_in",
  "delivery_address",
  "delivery_colony",
  "delivery_reference",
  "delivery_fee",
  "delivery_distance_meters",
  "delivery_latitude",
  "delivery_longitude",
  "delivery_status",
  "payment_method_requested",
  "requested_cash_tendered",
  "scheduled_for",
  "kitchen_release_at",
  "kitchen_released_at",
  "schedule_status",
  "marketplace_platform",
  "marketplace_payment_mode",
  "marketplace_handed_off_at",
  "marketplace_handed_off_by",
  "marketplace_handoff_key",
  "marketplace_cash_received",
  "marketplace_cash_shift_id",
] as const;

function shouldRetryLegacyOrderSelect(
  error: { code?: string; message?: string } | null
) {
  if (!error || (error.code !== "42703" && error.code !== "PGRST204")) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return OPTIONAL_ORDER_SELECT_COLUMNS.some((column) =>
    message.includes(column)
  );
}

function resolveCartItemBusinessId(
  item: CartItem,
  menuItemsBusinessMap: Map<string, string>
) {
  return item.business_id ?? menuItemsBusinessMap.get(item.menu_item_id) ?? null;
}

function parseCreatedOrders(data: unknown): Order[] {
  if (!data || typeof data !== "object") return [];
  const candidate = (data as { orders?: unknown }).orders;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (order): order is Order =>
      Boolean(order) &&
      typeof order === "object" &&
      typeof (order as { id?: unknown }).id === "string" &&
      typeof (order as { number?: unknown }).number === "number"
  );
}

async function publishOrderNotification(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  event: "new_order" | "in_preparation" | "ready"
) {
  try {
    const result = await supabase.functions.invoke("send-order-notification", {
      body: { orderId, event },
    });
    if (!result.error) return;
    console.warn(
      "El pedido se guardó, pero falló el aviso Push:",
      result.error.message
    );
  } catch (error: unknown) {
    console.warn(
      "El pedido se guardó, pero no se pudo solicitar el aviso Push:",
      error instanceof Error ? error.message : "Error desconocido"
    );
  }
}

async function getOrderScope() {
  const context = useBusinessContextStore.getState();
  await context.ensureLoaded();
  const scope = useBusinessContextStore.getState();
  const sameOrganizationBusinesses = scope.businesses.filter(
    (business) =>
      business.organization_id === scope.selectedOrganizationId &&
      business.business_lifecycle_status === "active"
  );
  const businessIds = getOrderableBusinessContexts(
    sameOrganizationBusinesses
  ).map((business) => business.business_id);
  const readableBusinessIds = getOrderReadableBusinessContexts(
    sameOrganizationBusinesses
  ).map((business) => business.business_id);
  return {
    businessId: scope.selectedBusinessId,
    businessIds,
    readableBusinessIds,
    legacyFallback: scope.legacyFallback,
    error: scope.error,
  };
}

function knownOrderBusinessId(
  state: Pick<OrderState, "activeOrders" | "todayOrders">,
  orderId: string
) {
  return (
    state.activeOrders.find((order) => order.id === orderId)?.business_id ??
    state.todayOrders.find((order) => order.id === orderId)?.business_id ??
    null
  );
}

export const useOrderStore = create<OrderState>((set, get) => ({
  activeOrders: [],
  todayOrders: [],
  menuItemsMap: new Map<string, string>(),
  menuItemsBusinessMap: new Map<string, string>(),
  loading: false,
  lastError: null,

  setMenuItemsMap: (items: MenuItem[]) => {
    set((state) => {
      const map = new Map(state.menuItemsMap);
      const businessMap = new Map(state.menuItemsBusinessMap);
      items.forEach((item) => {
        map.set(item.id, item.name);
        if (item.business_id) businessMap.set(item.id, item.business_id);
      });

      return {
        menuItemsMap: map,
        menuItemsBusinessMap: businessMap,
        activeOrders: state.activeOrders.map((order) => ({
          ...order,
          items: order.items.map((item) => ({
            ...item,
            menu_item_name:
              map.get(item.menu_item_id) ?? item.menu_item_name ?? "Producto",
          })),
        })),
        todayOrders: state.todayOrders.map((order) => ({
          ...order,
          items: order.items.map((item) => ({
            ...item,
            menu_item_name:
              map.get(item.menu_item_id) ?? item.menu_item_name ?? "Producto",
          })),
        })),
      };
    });
  },

  fetchActiveOrders: async () => {
    if (activeOrdersRequest) return activeOrdersRequest;

    activeOrdersRequest = (async () => {
      set({ loading: true });
      try {
        const scope = await getOrderScope();
        if (!scope.legacyFallback && scope.readableBusinessIds.length === 0) {
          set({
            activeOrders: [],
            todayOrders: [],
            lastError: scope.error,
          });
          return;
        }
        if (!scope.legacyFallback && !scope.businessId) {
          set({ activeOrders: [], todayOrders: [], lastError: "No hay un negocio disponible para esta cuenta." });
          return;
        }

        const supabase = createClient();
        const legacyOrderSelect =
          `id,business_id,number,status,type,total,notes,table_number,table_id,table_zone_id,table_zone_name,customer_name,cash_shift_id,table_visit_id,business_account_id,order_batch_id,cash_received,change_given,created_by,payment_method,payment_status,paid_amount,paid_at,cancelled_at,created_at,updated_at,${ACTIVE_ORDER_ITEMS_SELECT}`;
        const orderSelect = `${legacyOrderSelect},source_channel,channel_conversation_id,customer_id,business_customer_id,customer_phone,whatsapp_status_opt_in,delivery_address,delivery_colony,delivery_reference,delivery_fee,delivery_distance_meters,delivery_latitude,delivery_longitude,delivery_status,payment_method_requested,requested_cash_tendered,scheduled_for,kitchen_release_at,kitchen_released_at,schedule_status,marketplace_platform,marketplace_payment_mode,marketplace_handed_off_at,marketplace_handed_off_by,marketplace_handoff_key,marketplace_cash_received,marketplace_cash_shift_id`;
        const ordersDeadline = createRequestDeadline(ACTIVE_ORDERS_TIMEOUT_MS);
        let activeResult;
        try {
          let activeQuery = supabase
            .from("orders")
            .select(orderSelect);
          if (scope.readableBusinessIds.length > 0) {
            activeQuery = activeQuery.in("business_id", scope.readableBusinessIds);
          } else if (scope.businessId) {
            activeQuery = activeQuery.eq("business_id", scope.businessId);
          }
          activeResult = await activeQuery
            .in("status", ["pending", "in_kitchen", "ready", "served"])
            .order("created_at", { ascending: false })
            .limit(200)
            .abortSignal(ordersDeadline.signal);
        } finally {
          ordersDeadline.clear();
        }

        // El despliegue de la interfaz puede ocurrir antes que la migración del canal.
        // En ese caso preservamos el POS actual y omitimos únicamente los metadatos nuevos.
        if (shouldRetryLegacyOrderSelect(activeResult.error)) {
          const fallbackDeadline = createRequestDeadline(ACTIVE_ORDERS_TIMEOUT_MS);
          try {
            let fallbackQuery = supabase
              .from("orders")
              .select(legacyOrderSelect);
            if (scope.readableBusinessIds.length > 0) {
              fallbackQuery = fallbackQuery.in("business_id", scope.readableBusinessIds);
            } else if (scope.businessId) {
              fallbackQuery = fallbackQuery.eq("business_id", scope.businessId);
            }
            activeResult = await fallbackQuery
              .in("status", ["pending", "in_kitchen", "ready", "served"])
              .order("created_at", { ascending: false })
              .limit(200)
              .abortSignal(fallbackDeadline.signal);
          } finally {
            fallbackDeadline.clear();
          }
        }

        if (activeResult.error) {
          set({
            lastError: "No se pudieron cargar los pedidos del turno",
          });
          return;
        }

        const orders = (activeResult.data ?? []) as unknown as ActiveOrderRow[];

        if (orders.length === 0) {
          set({ activeOrders: [], todayOrders: [], lastError: null });
          return;
        }

        const ordersWithItems = mapActiveOrderRows(orders, get().menuItemsMap);
        set({
          activeOrders: ordersWithItems,
          todayOrders: ordersWithItems,
          lastError: null,
        });
      } catch (error) {
        set({
          lastError: orderLoadError(
            error,
            "No se pudieron actualizar los pedidos. Volveremos a intentar."
          ),
        });
      } finally {
        set({ loading: false });
        activeOrdersRequest = null;
      }
    })();

    return activeOrdersRequest;
  },

  createOrder: async (
    items,
    orderType,
    notes = "",
    tableNumber = "",
    customerName = "",
    tableId = "",
    delivery,
    customerId,
    customerPhone,
    channelConversationId,
      schedule,
      requestedCreationKey,
      businessCustomerId,
      businessCustomerIds,
      marketplace
  ) => {
    if (items.length === 0) {
      return {
        order: null,
        error: "Agrega al menos un producto",
        attemptOutcome: "rejected",
      };
    }

    const scope = await getOrderScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return {
        order: null,
        error: "No hay un negocio disponible para crear el pedido",
        attemptOutcome: "rejected",
      };
    }

    const supabase = createClient();
    const creationFingerprint = JSON.stringify({
      items: items.map((item) => ({
        menu_item_id: item.menu_item_id,
        business_id: item.business_id,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes,
        selected_modifiers: item.selected_modifiers,
      })),
      orderType,
      notes,
      tableNumber,
      customerName,
      customerPhone,
      businessCustomerId,
      businessCustomerIds,
      tableId,
      delivery,
      channelConversationId,
      schedule,
      marketplace,
    });
    const creationKey =
      requestedCreationKey ??
      pendingOrderCreationKeys.get(creationFingerprint) ??
      crypto.randomUUID();
    pendingOrderCreationKeys.set(creationFingerprint, creationKey);
    const productsTotal = calculateItemsTotal(items);
    const total = productsTotal;
    const orderItems = items.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.price,
      notes: item.notes,
      selected_modifiers: normalizeWhatsappPosModifiers(item.selected_modifiers),
    }));
    const itemBusinessIds = new Set(
      items
        .map((item) => resolveCartItemBusinessId(item, get().menuItemsBusinessMap))
        .filter((businessId): businessId is string => Boolean(businessId))
    );
    if (!scope.legacyFallback && itemBusinessIds.size === 0) {
      pendingOrderCreationKeys.delete(creationFingerprint);
      return {
        order: null,
        error: "No se pudo identificar el negocio de uno de los productos",
        attemptOutcome: "rejected",
      };
    }
    if (!scope.legacyFallback) {
      const inaccessibleBusiness = [...itemBusinessIds].find(
        (businessId) => !scope.businessIds.includes(businessId)
      );
      if (inaccessibleBusiness) {
        pendingOrderCreationKeys.delete(creationFingerprint);
        return {
          order: null,
          error: "No tienes permiso para operar uno de los negocios de la comanda",
          attemptOutcome: "rejected",
        };
      }
    }
    if (itemBusinessIds.size > 1 && orderType !== "comedor") {
      pendingOrderCreationKeys.delete(creationFingerprint);
      return {
        order: null,
        error: "Las comandas de varios negocios solo están disponibles para comedor",
        attemptOutcome: "rejected",
      };
    }
    if (marketplace && (itemBusinessIds.size !== 1 || orderType !== "para_llevar")) {
      pendingOrderCreationKeys.delete(creationFingerprint);
      return {
        order: null,
        error: "Los pedidos de plataforma deben pertenecer a un solo negocio y no usan domicilio local",
        attemptOutcome: "rejected",
      };
    }
    const useMixedTableOrder =
      !scope.legacyFallback &&
      orderType === "comedor" &&
      Boolean(tableId) &&
      itemBusinessIds.size > 1;
    const singleBusinessId =
      itemBusinessIds.size === 1 ? [...itemBusinessIds][0] : scope.businessId;

    let order: Order;
    let createdOrders: Order[] = [];
    let creationError: { message?: string; code?: string } | null = null;

    if (useMixedTableOrder) {
      const batchOrderParams = {
        p_creation_key: creationKey,
        p_table_id: tableId,
        p_table_number: tableNumber || null,
        p_items: orderItems,
        p_notes: notes,
        p_customer_name: customerName || null,
      };
      const result = Object.keys(businessCustomerIds ?? {}).length > 0
        ? await supabase.rpc("create_multibusiness_table_orders_with_customers", {
            ...batchOrderParams,
            p_customer_phone: customerPhone?.replace(/\D/g, "").slice(-15) || null,
            p_business_customer_ids: businessCustomerIds,
          })
        : await supabase.rpc("create_multibusiness_table_orders", batchOrderParams);
      creationError = result.error;
      createdOrders = parseCreatedOrders(result.data);
      if (creationError || createdOrders.length === 0) {
        const attemptOutcome = hasDefinitivePostgresError(creationError)
          ? "rejected"
          : "unknown";
        if (attemptOutcome === "rejected") {
          pendingOrderCreationKeys.delete(creationFingerprint);
        }
        return {
          order: null,
          error: orderCreateError(creationError, "No se pudo crear la comanda compartida"),
          attemptOutcome,
        };
      }
      order = createdOrders[0];
    } else if (singleBusinessId) {
      const result = await supabase.rpc("create_business_order_with_details", {
        p_business_id: singleBusinessId,
        p_creation_key: creationKey,
        p_items: orderItems,
        p_order_type: orderType,
        p_notes: notes,
        p_table_number: tableNumber || null,
        p_table_id: tableId || null,
        p_customer_name: customerName || null,
        p_details: {
          ...(customerId ? { customer_id: customerId } : {}),
          ...(businessCustomerId ? { business_customer_id: businessCustomerId } : {}),
          ...(customerPhone ? { customer_phone: customerPhone } : {}),
          ...(channelConversationId
            ? { channel_conversation_id: channelConversationId }
            : {}),
          ...(orderType === "domicilio" && delivery
            ? {
                delivery: {
                  phone: delivery.phone || null,
                  whatsapp_status_opt_in: delivery.whatsappStatusOptIn ?? false,
                  address: delivery.address.trim(),
                  colony: delivery.colony?.trim() || null,
                  reference: delivery.reference.trim() || null,
                  fee: Math.max(0, Math.round(delivery.fee)),
                  distance_meters: delivery.distanceMeters ?? null,
                  latitude: delivery.latitude ?? null,
                  longitude: delivery.longitude ?? null,
                  payment_method: delivery.paymentMethod ?? null,
                  cash_tendered: delivery.cashTendered ?? null,
                },
              }
            : {}),
          ...(schedule
            ? {
                schedule: {
                  scheduled_for: schedule.scheduledFor,
                  kitchen_release_at: schedule.kitchenReleaseAt,
                },
              }
            : {}),
          ...(marketplace
            ? {
                marketplace: {
                  platform: marketplace.platform,
                  payment_mode: marketplace.paymentMode,
                },
              }
            : {}),
        },
      });
      creationError = result.error;
      if (creationError || !result.data) {
        const attemptOutcome = hasDefinitivePostgresError(creationError)
          ? "rejected"
          : "unknown";
        if (attemptOutcome === "rejected") {
          pendingOrderCreationKeys.delete(creationFingerprint);
        }
        return {
          order: null,
          error: orderCreateError(creationError, "No se pudo crear el pedido"),
          attemptOutcome,
        };
      }
      order = result.data as Order;
      createdOrders = [order];
    } else {
      const result = await supabase.rpc("create_order_with_items", {
        p_creation_key: creationKey,
        p_items: orderItems,
        p_order_type: orderType,
        p_total: total,
        p_notes: notes,
        p_table_number: tableNumber || null,
        p_table_id: tableId || null,
        p_customer_name: customerName || null,
      });
      creationError = result.error;
      if (creationError || !result.data) {
        const attemptOutcome = hasDefinitivePostgresError(creationError)
          ? "rejected"
          : "unknown";
        if (attemptOutcome === "rejected") {
          pendingOrderCreationKeys.delete(creationFingerprint);
        }
        return {
          order: null,
          error: orderCreateError(creationError, "No se pudo crear el pedido"),
          attemptOutcome,
        };
      }
      order = result.data as Order;
      createdOrders = [order];
    }

    if (!useMixedTableOrder && !singleBusinessId && (customerId || businessCustomerId || customerPhone || channelConversationId || (orderType === "domicilio" && delivery) || schedule)) {
      const updatedQuery = supabase
        .from("orders")
        .update({
          ...(customerId ? { customer_id: customerId } : {}),
          ...(businessCustomerId ? { business_customer_id: businessCustomerId } : {}),
          ...(customerPhone ? { customer_phone: customerPhone } : {}),
          ...(channelConversationId
            ? { source_channel: "whatsapp", channel_conversation_id: channelConversationId }
            : {}),
          ...(orderType === "domicilio" && delivery
            ? {
                total: productsTotal,
                customer_phone: delivery.phone || null,
                whatsapp_status_opt_in: delivery.whatsappStatusOptIn ?? false,
                delivery_address: delivery.address.trim(),
                delivery_colony: delivery.colony?.trim() || null,
                delivery_reference: delivery.reference.trim() || null,
                delivery_fee: Math.max(0, Math.round(delivery.fee)),
                delivery_distance_meters: delivery.distanceMeters ?? null,
                delivery_latitude: delivery.latitude ?? null,
                delivery_longitude: delivery.longitude ?? null,
                notes,
                payment_method_requested: delivery.paymentMethod ?? null,
                requested_cash_tendered: delivery.cashTendered ?? null,
                delivery_status: "pending",
                ...(schedule
                  ? {
                      scheduled_for: schedule.scheduledFor,
                      kitchen_release_at: schedule.kitchenReleaseAt,
                      kitchen_released_at: null,
                      schedule_status: "scheduled",
                    }
                  : {}),
              }
            : {}),
          ...(schedule && !(orderType === "domicilio" && delivery)
            ? {
                scheduled_for: schedule.scheduledFor,
                kitchen_release_at: schedule.kitchenReleaseAt,
                kitchen_released_at: null,
                schedule_status: "scheduled",
              }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      const { data: updated, error: deliveryError } = await updatedQuery
        .select("*")
        .single();
      if (deliveryError || !updated) {
        return {
          order: null,
          error: "El pedido se creó, pero no se pudo guardar el domicilio",
          attemptOutcome: "unknown",
        };
      }
      order = updated as Order;
      createdOrders = [order];
    }
    pendingOrderCreationKeys.delete(creationFingerprint);

    const menuItemsMap = get().menuItemsMap;
    const menuItemsBusinessMap = get().menuItemsBusinessMap;
    const localOrders = createdOrders.map((createdOrder) => {
      const orderItemsForBusiness = useMixedTableOrder
        ? items.filter(
            (item) =>
              resolveCartItemBusinessId(item, menuItemsBusinessMap) === createdOrder.business_id
          )
        : items;
      return buildLocalOrder(
        createdOrder,
        orderItemsForBusiness.length > 0 ? orderItemsForBusiness : items,
        menuItemsMap
      );
    });
    set((state) => ({
      activeOrders: [
        ...localOrders.filter(
          (localOrder) => !state.activeOrders.some((item) => item.id === localOrder.id)
        ),
        ...state.activeOrders,
      ],
      todayOrders: [
        ...localOrders.filter(
          (localOrder) => !state.todayOrders.some((item) => item.id === localOrder.id)
        ),
        ...state.todayOrders,
      ],
    }));
    for (const createdOrder of createdOrders) {
      const scheduleReleased =
        createdOrder.schedule_status !== "scheduled" ||
        (createdOrder.kitchen_release_at !== null &&
          createdOrder.kitchen_release_at !== undefined &&
          new Date(createdOrder.kitchen_release_at).getTime() <= Date.now());
      if (scheduleReleased) {
        // El pedido ya está persistido y Realtime se encarga de Cocina. El Push
        // es una señal secundaria y no debe retrasar la confirmación del POS.
        void publishOrderNotification(supabase, createdOrder.id, "new_order");
      }
    }
    return {
      order,
      orders: createdOrders,
      error: null,
      attemptOutcome: "committed",
    };
  },

  markAsServed: async (orderId) => {
    const scope = await getOrderScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return { error: "No hay un negocio disponible para actualizar el pedido" };
    }

    const supabase = createClient();
    const targetBusinessId = scope.legacyFallback
      ? scope.businessId
      : knownOrderBusinessId(get(), orderId) ?? scope.businessId;
    let paymentQuery = supabase
      .from("orders")
      .select("payment_status")
      .eq("id", orderId);
    if (targetBusinessId) paymentQuery = paymentQuery.eq("business_id", targetBusinessId);
    const { data, error } = await paymentQuery.single();
    if (error || !data) {
      return { error: error?.message ?? "No se pudo consultar el estado de pago" };
    }
    return get().updateOrderStatus(
      orderId,
      data.payment_status === "paid" ? "paid" : "served"
    );
  },

  updateOrderStatus: async (orderId, status) => {
    const scope = await getOrderScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return { error: "No hay un negocio disponible para actualizar el pedido" };
    }

    const supabase = createClient();
    const targetBusinessId = scope.legacyFallback
      ? scope.businessId
      : knownOrderBusinessId(get(), orderId) ?? scope.businessId;
    let updatedOrder: Order | null = null;
    let error: { message: string } | null = null;

    if (targetBusinessId) {
      const result = await supabase.rpc("update_business_order_status", {
        p_business_id: targetBusinessId,
        p_order_id: orderId,
        p_status: status,
      });
      updatedOrder = (result.data as Order | null) ?? null;
      error = result.error;
    } else {
      const result = await supabase
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .select("id,status,updated_at")
        .maybeSingle();
      updatedOrder = (result.data as Order | null) ?? null;
      error = result.error;
    }

    if (error || !updatedOrder) {
      return {
        error:
          error?.message ||
          "No se pudo actualizar el pedido. Verifica tu conexión y permisos.",
      };
    }

    if (status === "in_kitchen" || status === "ready") {
      // No bloqueamos el cambio operativo esperando al proveedor de Push.
      void publishOrderNotification(
        supabase,
        orderId,
        status === "in_kitchen" ? "in_preparation" : "ready",
      );
    }

    set((state) => {
      const updatedTodayOrders = state.todayOrders.map((order) =>
        order.id === orderId ? { ...order, status } : order
      );
      return {
        todayOrders: updatedTodayOrders,
        activeOrders: state.activeOrders
          .map((order) => (order.id === orderId ? { ...order, status } : order))
          .filter((order) => isLiveStatus(order.status)),
      };
    });
    return { error: null };
  },

  updateOrderWithItems: async (
    orderId,
    items,
    tableNumber = "",
    customerName = "",
    tableId = "",
    delivery,
    notes,
    customerId,
    customerPhone,
    channelConversationId,
    schedule,
    businessCustomerId
  ) => {
    if (items.length === 0) {
      return { error: "El pedido debe tener al menos un artículo" };
    }

    const scope = await getOrderScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return { error: "No hay un negocio disponible para editar el pedido" };
    }

    const supabase = createClient();
    const orderItems = items.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.price,
      notes: item.notes,
      selected_modifiers: normalizeWhatsappPosModifiers(item.selected_modifiers),
    }));
    const targetBusinessId = scope.legacyFallback
      ? scope.businessId
      : knownOrderBusinessId(get(), orderId) ?? scope.businessId;
    const { error } = targetBusinessId
      ? await supabase.rpc("update_business_order_with_items", {
          p_business_id: targetBusinessId,
          p_order_id: orderId,
          p_items: orderItems,
          p_total: calculateItemsTotal(items),
          p_table_number: tableNumber || null,
          p_table_id: tableId || null,
          p_customer_name: customerName || null,
        })
      : await supabase.rpc("update_order_with_items", {
          p_order_id: orderId,
          p_items: orderItems,
          p_total: calculateItemsTotal(items),
          p_table_number: tableNumber || null,
          p_table_id: tableId || null,
          p_customer_name: customerName || null,
        });

    if (error) {
      return { error: error.message || "No se pudo editar el pedido" };
    }

    if (delivery || notes !== undefined || customerId !== undefined || businessCustomerId !== undefined || customerPhone !== undefined || channelConversationId || schedule !== undefined) {
      let deliveryQuery = supabase
        .from("orders")
        .update({
          ...(delivery
            ? {
                customer_phone: delivery.phone || null,
                whatsapp_status_opt_in: delivery.whatsappStatusOptIn ?? false,
                delivery_address: delivery.address.trim(),
                delivery_colony: delivery.colony?.trim() || null,
                delivery_reference: delivery.reference.trim() || null,
                delivery_fee: Math.max(0, Math.round(delivery.fee)),
                delivery_distance_meters: delivery.distanceMeters ?? null,
                delivery_latitude: delivery.latitude ?? null,
                delivery_longitude: delivery.longitude ?? null,
                payment_method_requested: delivery.paymentMethod ?? null,
                requested_cash_tendered: delivery.cashTendered ?? null,
                delivery_status: "pending",
                ...(delivery.scheduledFor
                  ? {
                      scheduled_for: delivery.scheduledFor,
                      kitchen_release_at: delivery.kitchenReleaseAt ?? null,
                      kitchen_released_at: null,
                      schedule_status: "scheduled",
                    }
                  : {
                      scheduled_for: null,
                      kitchen_release_at: null,
                      kitchen_released_at: null,
                      schedule_status: "none",
                    }),
              }
            : {}),
          ...(customerId !== undefined ? { customer_id: customerId } : {}),
          ...(businessCustomerId !== undefined ? { business_customer_id: businessCustomerId } : {}),
          ...(customerPhone !== undefined ? { customer_phone: customerPhone || null } : {}),
          ...(channelConversationId
            ? { source_channel: "whatsapp", channel_conversation_id: channelConversationId }
            : {}),
          ...(schedule !== undefined
            ? schedule
              ? {
                  scheduled_for: schedule.scheduledFor,
                  kitchen_release_at: schedule.kitchenReleaseAt,
                  kitchen_released_at: null,
                  schedule_status: "scheduled",
                }
              : {
                  scheduled_for: null,
                  kitchen_release_at: null,
                  kitchen_released_at: null,
                  schedule_status: "none",
                }
            : {}),
          ...(notes !== undefined ? { notes } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (targetBusinessId) deliveryQuery = deliveryQuery.eq("business_id", targetBusinessId);
      const { error: deliveryError } = await deliveryQuery;
      if (deliveryError) return { error: "El pedido se actualizó, pero no se pudo guardar el domicilio" };
    }

    const currentOrder =
      get().todayOrders.find((order) => order.id === orderId) ??
      get().activeOrders.find((order) => order.id === orderId);
    if (currentOrder) {
      const updatedOrder = buildLocalOrder(
        {
          ...currentOrder,
          status:
            currentOrder.status === "ready" || currentOrder.status === "served"
              ? "pending"
              : currentOrder.status,
          total: calculateItemsTotal(items),
          table_number: tableNumber || null,
          table_id: tableId || null,
          customer_name: customerName || null,
          customer_id: customerId ?? currentOrder.customer_id,
          business_customer_id: businessCustomerId ?? currentOrder.business_customer_id,
          customer_phone: customerPhone ?? delivery?.phone ?? currentOrder.customer_phone,
          whatsapp_status_opt_in: delivery?.whatsappStatusOptIn ?? currentOrder.whatsapp_status_opt_in,
          delivery_address: delivery?.address || currentOrder.delivery_address,
          delivery_colony: delivery?.colony ?? currentOrder.delivery_colony,
          delivery_reference: delivery?.reference || currentOrder.delivery_reference,
          delivery_fee: delivery?.fee ?? currentOrder.delivery_fee,
          delivery_distance_meters: delivery?.distanceMeters ?? currentOrder.delivery_distance_meters,
          delivery_latitude: delivery?.latitude ?? currentOrder.delivery_latitude,
          delivery_longitude: delivery?.longitude ?? currentOrder.delivery_longitude,
          payment_method_requested: delivery?.paymentMethod ?? currentOrder.payment_method_requested,
          requested_cash_tendered: delivery?.cashTendered ?? currentOrder.requested_cash_tendered,
          scheduled_for: schedule !== undefined
            ? schedule?.scheduledFor ?? null
            : delivery
              ? delivery.scheduledFor ?? null
              : currentOrder.scheduled_for,
          kitchen_release_at: schedule !== undefined
            ? schedule?.kitchenReleaseAt ?? null
            : delivery
              ? delivery.kitchenReleaseAt ?? null
              : currentOrder.kitchen_release_at,
          schedule_status: schedule !== undefined
            ? schedule
              ? "scheduled"
              : "none"
            : delivery
              ? delivery.scheduledFor
                ? "scheduled"
                : "none"
              : currentOrder.schedule_status,
          notes: notes ?? currentOrder.notes,
          updated_at: new Date().toISOString(),
        },
        items,
        get().menuItemsMap
      );
      set((state) => ({
        todayOrders: state.todayOrders.map((order) =>
          order.id === orderId ? updatedOrder : order
        ),
        activeOrders: state.activeOrders.map((order) =>
          order.id === orderId ? updatedOrder : order
        ),
      }));
    } else {
      await get().fetchActiveOrders();
    }

    return { error: null };
  },

  deleteOrder: async (orderId) => {
    const scope = await getOrderScope();
    if (!scope.legacyFallback && !scope.businessId) {
      return { error: "No hay un negocio disponible para borrar el pedido" };
    }

    const supabase = createClient();
    const targetBusinessId = scope.legacyFallback
      ? scope.businessId
      : knownOrderBusinessId(get(), orderId) ?? scope.businessId;
    let deleteQuery = supabase
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (targetBusinessId) deleteQuery = deleteQuery.eq("business_id", targetBusinessId);
    const { data, error } = await deleteQuery.select("id").maybeSingle();

    if (error || !data) {
      return { error: "No se pudo borrar el pedido" };
    }

    set((state) => ({
      activeOrders: state.activeOrders.filter((order) => order.id !== orderId),
      todayOrders: state.todayOrders.filter((order) => order.id !== orderId),
    }));
    return { error: null };
  },

  cancelOrder: async (orderId) => get().updateOrderStatus(orderId, "cancelled"),

  subscribeToOrders: () => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pollingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let channelGeneration = 0;
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void get().fetchActiveOrders();
      }, 120);
    };

    const applyOrderChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const incoming = payload.new as Partial<Order>;
      const previous = payload.old as Partial<Order>;
      const orderId = incoming.id ?? previous.id;
      if (!orderId) return;

      if (payload.eventType === "DELETE") {
        set((state) => ({
          activeOrders: state.activeOrders.filter((order) => order.id !== orderId),
          todayOrders: state.todayOrders.filter((order) => order.id !== orderId),
        }));
        return;
      }

      if (!incoming.status && !incoming.updated_at) return;

      set((state) => ({
        activeOrders: state.activeOrders
          .map((order) =>
            order.id === orderId ? { ...order, ...incoming } : order
          )
          .filter((order) => isLiveStatus(order.status)),
        todayOrders: state.todayOrders.map((order) =>
          order.id === orderId ? { ...order, ...incoming } : order
        ),
      }));
    };

    const handleChannelStatus = (
      generation: number,
      status: string,
      error?: Error
    ) => {
      if (disposed || generation !== channelGeneration) return;

      if (status === "SUBSCRIBED") {
        reconnectAttempt = 0;
        scheduleRefresh();
        return;
      }

      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") {
        return;
      }

      const errorMessage = error?.message.toLowerCase() ?? "";
      const isNormalSocketClose =
        errorMessage.includes("socket closed: 1001") ||
        errorMessage.includes("going away");

      if (error && !isNormalSocketClose) {
        console.warn("Supabase Realtime desconectado:", error.message);
      }

      set({
        lastError: "Conexión en tiempo real interrumpida. Reintentando...",
      });

      if (reconnectTimer) return;
      const reconnectDelay = getRealtimeReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        if (disposed) return;
        const previousChannel = channel;
        channel = null;
        if (previousChannel) void supabase.removeChannel(previousChannel);
        connect();
        reconnectTimer = null;
      }, reconnectDelay);
    };

    const connect = () => {
      if (disposed) return;

      const generation = ++channelGeneration;
      channel = supabase
        .channel(`orders-changes-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            applyOrderChange(payload);
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_items" },
          scheduleRefresh
        )
        .subscribe((status: string, error?: Error) =>
          handleChannelStatus(generation, status, error)
        );
    };

    connect();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void get().fetchActiveOrders();
      }
    };
    const handleBusinessChange = () => {
      activeOrdersRequest = null;
      set({ activeOrders: [], todayOrders: [], lastError: null });
      scheduleRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (typeof window !== "undefined") {
      window.addEventListener("mideli:business-changed", handleBusinessChange);
    }

    // Realtime is the fast path. A lighter fallback keeps long-running tablets
    // correct if a websocket event is missed without querying all orders every
    // few seconds on every device.
    pollingTimer = setInterval(() => {
      if (!document.hidden) void get().fetchActiveOrders();
    }, 15000);

    return () => {
      disposed = true;
      channelGeneration += 1;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (pollingTimer) clearInterval(pollingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (typeof window !== "undefined") {
        window.removeEventListener("mideli:business-changed", handleBusinessChange);
      }
      if (channel) void supabase.removeChannel(channel);
    };
  },
}));
