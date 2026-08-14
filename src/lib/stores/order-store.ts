import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Order, OrderItem, CartItem, MenuItem } from "@/types/database";
import {
  ACTIVE_ORDERS_TIMEOUT_MS,
  createRequestDeadline,
  getRealtimeReconnectDelay,
} from "@/lib/realtime-resilience";

export interface OrderItemWithName extends OrderItem {
  menu_item_name?: string;
}

export interface OrderWithItems extends Order {
  items: OrderItemWithName[];
}

interface OrderState {
  activeOrders: OrderWithItems[];
  todayOrders: OrderWithItems[];
  menuItemsMap: Map<string, string>;
  loading: boolean;
  lastError: string | null;
  fetchActiveOrders: () => Promise<void>;
  createOrder: (
    items: CartItem[],
    orderType: "comedor" | "domicilio" | "para_llevar",
    notes?: string,
    tableNumber?: string,
    customerName?: string,
    tableId?: string
  ) => Promise<{ order: Order | null; error: string | null }>;
  updateOrderStatus: (
    orderId: string,
    status: Order["status"]
  ) => Promise<{ error: string | null }>;
  updateOrderWithItems: (
    orderId: string,
    items: CartItem[],
    tableNumber?: string,
    customerName?: string,
    tableId?: string
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

function publishOrderNotification(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  event: "new_order" | "ready"
) {
  void supabase.functions
    .invoke("send-order-notification", { body: { orderId, event } })
    .then((result: { error: { message: string } | null }) => {
      if (!result.error) return;
      console.warn(
        "El pedido se guardó, pero falló el aviso Push:",
        result.error.message
      );
    })
    .catch((error: unknown) => {
      console.warn(
        "El pedido se guardó, pero no se pudo solicitar el aviso Push:",
        error instanceof Error ? error.message : "Error desconocido"
      );
    });
}

export const useOrderStore = create<OrderState>((set, get) => ({
  activeOrders: [],
  todayOrders: [],
  menuItemsMap: new Map<string, string>(),
  loading: false,
  lastError: null,

  setMenuItemsMap: (items: MenuItem[]) => {
    const map = new Map<string, string>();
    items.forEach((item) => map.set(item.id, item.name));
    set((state) => ({
      menuItemsMap: map,
      activeOrders: state.activeOrders.map((order) => ({
        ...order,
        items: order.items.map((item) => ({
          ...item,
          menu_item_name: map.get(item.menu_item_id) ?? item.menu_item_name ?? "Producto",
        })),
      })),
      todayOrders: state.todayOrders.map((order) => ({
        ...order,
        items: order.items.map((item) => ({
          ...item,
          menu_item_name: map.get(item.menu_item_id) ?? item.menu_item_name ?? "Producto",
        })),
      })),
    }));
  },

  fetchActiveOrders: async () => {
    if (activeOrdersRequest) return activeOrdersRequest;

    activeOrdersRequest = (async () => {
      set({ loading: true });
      try {
        const supabase = createClient();
        const orderSelect =
          "id,number,status,type,total,notes,table_number,table_id,table_zone_id,table_zone_name,customer_name,cash_shift_id,cash_received,change_given,created_by,payment_method,payment_status,paid_amount,paid_at,cancelled_at,created_at,updated_at";
        const ordersDeadline = createRequestDeadline(ACTIVE_ORDERS_TIMEOUT_MS);
        let activeResult;
        try {
          activeResult = await supabase
            .from("orders")
            .select(orderSelect)
            .in("status", ["pending", "in_kitchen", "ready", "served"])
            .order("created_at", { ascending: false })
            .limit(200)
            .abortSignal(ordersDeadline.signal);
        } finally {
          ordersDeadline.clear();
        }

        if (activeResult.error) {
          set({
            lastError: "No se pudieron cargar los pedidos del turno",
          });
          return;
        }

        const orders = (activeResult.data ?? []) as Order[];

        if (orders.length === 0) {
          set({ activeOrders: [], todayOrders: [], lastError: null });
          return;
        }

        const itemsDeadline = createRequestDeadline(ACTIVE_ORDERS_TIMEOUT_MS);
        let orderItemsResult;
        try {
          orderItemsResult = await supabase
            .from("order_items")
            .select("id,order_id,menu_item_id,quantity,unit_price,notes,selected_modifiers,created_at")
            .in(
              "order_id",
              orders.map((order) => order.id)
            )
            .abortSignal(itemsDeadline.signal);
        } finally {
          itemsDeadline.clear();
        }
        const { data: orderItemsData, error: itemsError } = orderItemsResult;

        if (itemsError || !orderItemsData) {
          set({
            lastError: "No se pudieron cargar los artículos de los pedidos",
          });
          return;
        }

        const orderItemsByOrder = new Map<string, OrderItem[]>();
        for (const item of orderItemsData as OrderItem[]) {
          const currentItems = orderItemsByOrder.get(item.order_id) ?? [];
          currentItems.push(item);
          orderItemsByOrder.set(item.order_id, currentItems);
        }

        const map = get().menuItemsMap;
        const ordersWithItems = orders.map((order) => ({
          ...order,
          items: (orderItemsByOrder.get(order.id) ?? []).map((item) => ({
              ...item,
              menu_item_name: map.get(item.menu_item_id) ?? "Producto",
            })),
        }));
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
    tableId = ""
  ) => {
    if (items.length === 0) {
      return { order: null, error: "Agrega al menos un producto" };
    }

    const supabase = createClient();
    const creationFingerprint = JSON.stringify({
      items: items.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes,
        selected_modifiers: item.selected_modifiers,
      })),
      orderType,
      notes,
      tableNumber,
      customerName,
      tableId,
    });
    const creationKey = pendingOrderCreationKeys.get(creationFingerprint) ?? crypto.randomUUID();
    pendingOrderCreationKeys.set(creationFingerprint, creationKey);
    const total = calculateItemsTotal(items);
    const { data, error } = await supabase.rpc("create_order_with_items", {
      p_creation_key: creationKey,
      p_items: items.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: item.price,
        notes: item.notes,
        selected_modifiers: item.selected_modifiers,
      })),
      p_order_type: orderType,
      p_total: total,
      p_notes: notes,
      p_table_number: tableNumber || null,
      p_table_id: tableId || null,
      p_customer_name: customerName || null,
    });

    if (error || !data) {
      return {
        order: null,
        error: error?.message || "No se pudo crear el pedido",
      };
    }

    const order = data as Order;
    pendingOrderCreationKeys.delete(creationFingerprint);

    const localOrder = buildLocalOrder(order, items, get().menuItemsMap);
    set((state) => ({
      activeOrders: state.activeOrders.some((item) => item.id === localOrder.id)
        ? state.activeOrders
        : [localOrder, ...state.activeOrders],
      todayOrders: state.todayOrders.some((item) => item.id === localOrder.id)
        ? state.todayOrders
        : [localOrder, ...state.todayOrders],
    }));
    publishOrderNotification(supabase, order.id, "new_order");
    return { order, error: null };
  },

  markAsServed: async (orderId) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("id", orderId)
      .single();
    if (error || !data) {
      return { error: error?.message ?? "No se pudo consultar el estado de pago" };
    }
    return get().updateOrderStatus(
      orderId,
      data.payment_status === "paid" ? "paid" : "served"
    );
  },

  updateOrderStatus: async (orderId, status) => {
    const supabase = createClient();
    const { data: updatedOrder, error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .select("id,status,updated_at")
      .maybeSingle();

    if (error || !updatedOrder) {
      return {
        error:
          error?.message ||
          "No se pudo actualizar el pedido. Verifica tu conexión y permisos.",
      };
    }

    if (status === "ready") {
      publishOrderNotification(supabase, orderId, "ready");
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
    tableId = ""
  ) => {
    if (items.length === 0) {
      return { error: "El pedido debe tener al menos un artículo" };
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("update_order_with_items", {
      p_order_id: orderId,
      p_items: items.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: item.price,
        notes: item.notes,
        selected_modifiers: item.selected_modifiers,
      })),
      p_total: calculateItemsTotal(items),
      p_table_number: tableNumber || null,
      p_table_id: tableId || null,
      p_customer_name: customerName || null,
    });

    if (error) {
      return { error: error.message || "No se pudo editar el pedido" };
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
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { error: "No se pudo borrar el pedido" };
    }

    set((state) => ({
      activeOrders: state.activeOrders.filter((order) => order.id !== orderId),
      todayOrders: state.todayOrders.filter((order) => order.id !== orderId),
    }));
    return { error: null };
  },

  cancelOrder: async (orderId) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      return { error: "No se pudo cancelar el pedido" };
    }

    set((state) => ({
      activeOrders: state.activeOrders.filter((o) => o.id !== orderId),
      todayOrders: state.todayOrders.filter((o) => o.id !== orderId),
    }));
    return { error: null };
  },

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

    document.addEventListener("visibilitychange", handleVisibilityChange);

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
      if (channel) void supabase.removeChannel(channel);
    };
  },
}));
