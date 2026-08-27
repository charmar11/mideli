import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WhatsappCustomerAddress,
  WhatsappCustomerDetail,
  WhatsappCustomerDirectory,
  WhatsappCustomerOrder,
} from "./admin-types";
import {
  buildWhatsappCustomerSummaries,
  exactOrderNumberFromSearch,
  normalizeWhatsappCustomerSearch,
  type WhatsappCustomerConversationSource,
  type WhatsappCustomerOrderSource,
  type WhatsappCustomerSource,
} from "./customers";

type AdminClient = ReturnType<typeof createAdminClient>;

const PAGE_SIZE = 1_000;
const MAX_ORDER_ROWS = 20_000;

type CustomerRow = {
  id: string;
  phone: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type OrderMetricRow = {
  customer_id: string | null;
  number: number;
  status: string;
  paid_amount: number | null;
  payment_status: string;
  created_at: string;
};

function customerSource(row: CustomerRow): WhatsappCustomerSource {
  return {
    id: row.id,
    phone: row.phone,
    displayName: row.display_name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function orderMetricSource(row: OrderMetricRow): WhatsappCustomerOrderSource {
  return {
    customerId: row.customer_id,
    number: row.number,
    status: row.status,
    paidAmount: Number(row.paid_amount ?? 0),
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  };
}

async function loadOrderMetrics(admin: AdminClient, customerIds: string[]) {
  if (customerIds.length === 0) return [];
  const rows: OrderMetricRow[] = [];
  for (let from = 0; from < MAX_ORDER_ROWS; from += PAGE_SIZE) {
    const result = await admin
      .from("orders")
      .select("customer_id,number,status,paid_amount,payment_status,created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as OrderMetricRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadLatestConversations(admin: AdminClient, customerIds: string[]) {
  if (customerIds.length === 0) return [];
  const rows: Array<{ customer_id: string; id: string; status: string; updated_at: string }> = [];
  for (let from = 0; from < 5_000; from += PAGE_SIZE) {
    const result = await admin
      .from("channel_conversations")
      .select("customer_id,id,status,updated_at")
      .in("customer_id", customerIds)
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map((row) => ({
    customerId: row.customer_id,
    id: row.id,
    status: row.status,
    updatedAt: row.updated_at,
  })) satisfies WhatsappCustomerConversationSource[];
}

async function loadCustomersForDirectory(admin: AdminClient, query: string) {
  const columns = "id,phone,display_name,created_at,updated_at";
  if (!query) {
    const [recentCustomers, recentOrders] = await Promise.all([
      admin.from("customers").select(columns).order("updated_at", { ascending: false }).limit(50),
      admin
        .from("orders")
        .select("customer_id")
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (recentCustomers.error) throw recentCustomers.error;
    if (recentOrders.error) throw recentOrders.error;
    const recentRows = [...((recentCustomers.data ?? []) as CustomerRow[])];
    const orderCustomerIds = [
      ...new Set(
        (recentOrders.data ?? []).flatMap((order) => order.customer_id ? [order.customer_id] : [])
      ),
    ];
    const activeRows: CustomerRow[] = [];
    if (orderCustomerIds.length > 0) {
      const activeCustomers = await admin
        .from("customers")
        .select(columns)
        .in("id", orderCustomerIds);
      if (activeCustomers.error) throw activeCustomers.error;
      const activeById = new Map(
        ((activeCustomers.data ?? []) as CustomerRow[]).map((row) => [row.id, row])
      );
      for (const customerId of orderCustomerIds) {
        const customer = activeById.get(customerId);
        if (customer) activeRows.push(customer);
      }
    }
    const merged = new Map<string, CustomerRow>();
    for (const row of [...activeRows, ...recentRows]) merged.set(row.id, row);
    return [...merged.values()].slice(0, 50);
  }

  const digits = query.replace(/\D/g, "");
  const orderNumber = exactOrderNumberFromSearch(query);
  const [byName, byPhone, byOrder] = await Promise.all([
    admin.from("customers").select(columns).ilike("display_name", `%${query}%`).limit(50),
    digits
      ? admin.from("customers").select(columns).ilike("phone", `%${digits}%`).limit(50)
      : Promise.resolve({ data: [], error: null }),
    orderNumber
      ? admin.from("orders").select("customer_id").eq("number", orderNumber).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (byName.error) throw byName.error;
  if (byPhone.error) throw byPhone.error;
  if (byOrder.error) throw byOrder.error;

  const merged = new Map<string, CustomerRow>();
  for (const row of [...(byName.data ?? []), ...(byPhone.data ?? [])] as CustomerRow[]) {
    merged.set(row.id, row);
  }
  const orderCustomerId = byOrder.data?.customer_id;
  if (orderCustomerId && !merged.has(orderCustomerId)) {
    const orderCustomer = await admin
      .from("customers")
      .select(columns)
      .eq("id", orderCustomerId)
      .maybeSingle();
    if (orderCustomer.error) throw orderCustomer.error;
    if (orderCustomer.data) merged.set(orderCustomer.data.id, orderCustomer.data as CustomerRow);
  }
  return [...merged.values()].slice(0, 50);
}

export async function loadWhatsappCustomerDirectory(
  admin: AdminClient,
  rawQuery = ""
): Promise<WhatsappCustomerDirectory> {
  const query = normalizeWhatsappCustomerSearch(rawQuery);
  const customerRows = await loadCustomersForDirectory(admin, query);
  const customerIds = customerRows.map((row) => row.id);
  const [orders, conversations] = await Promise.all([
    loadOrderMetrics(admin, customerIds),
    loadLatestConversations(admin, customerIds),
  ]);
  return {
    query,
    customers: buildWhatsappCustomerSummaries(
      customerRows.map(customerSource),
      orders.map(orderMetricSource),
      conversations
    ),
  };
}

async function loadDetailedOrders(admin: AdminClient, customerId: string) {
  const result = await admin
    .from("orders")
    .select(
      "id,number,status,type,total,paid_amount,payment_status,payment_method,payment_method_requested,source_channel,delivery_status,delivery_address,delivery_reference,delivery_fee,channel_conversation_id,created_at"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) throw result.error;
  const orders = result.data ?? [];
  const orderIds = orders.map((order) => order.id);
  const itemRows: Array<{
    id: string;
    order_id: string;
    menu_item_id: string;
    quantity: number;
    unit_price: number;
    notes: string;
  }> = [];
  if (orderIds.length > 0) {
    for (let from = 0; from < 5_000; from += PAGE_SIZE) {
      const items = await admin
        .from("order_items")
        .select("id,order_id,menu_item_id,quantity,unit_price,notes")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (items.error) throw items.error;
      const page = items.data ?? [];
      itemRows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  const menuItemIds = [...new Set(itemRows.map((item) => item.menu_item_id).filter(Boolean))];
  const menuNames = new Map<string, string>();
  if (menuItemIds.length > 0) {
    const menuItems = await admin.from("menu_items").select("id,name").in("id", menuItemIds);
    if (menuItems.error) throw menuItems.error;
    for (const item of menuItems.data ?? []) menuNames.set(item.id, item.name);
  }
  const itemsByOrder = new Map<string, WhatsappCustomerOrder["items"]>();
  for (const item of itemRows) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push({
      id: item.id,
      name: menuNames.get(item.menu_item_id) ?? "Producto del menú",
      quantity: item.quantity,
      unitPrice: Number(item.unit_price ?? 0),
      notes: item.notes ?? "",
    });
    itemsByOrder.set(item.order_id, current);
  }
  return orders.map((order) => ({
    id: order.id,
    number: order.number,
    status: order.status,
    type: order.type,
    total: Number(order.total ?? 0),
    paidAmount: Number(order.paid_amount ?? 0),
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method_requested ?? order.payment_method ?? "",
    sourceChannel: order.source_channel ?? "pos",
    deliveryStatus: order.delivery_status ?? "",
    deliveryAddress: order.delivery_address ?? "",
    deliveryReference: order.delivery_reference ?? "",
    deliveryFee: Number(order.delivery_fee ?? 0),
    channelConversationId: order.channel_conversation_id,
    createdAt: order.created_at,
    items: itemsByOrder.get(order.id) ?? [],
  })) satisfies WhatsappCustomerOrder[];
}

export async function loadWhatsappCustomerDetail(
  admin: AdminClient,
  customerId: string
): Promise<WhatsappCustomerDetail> {
  const [customerResult, addressResult, metrics, conversations, orders] = await Promise.all([
    admin
      .from("customers")
      .select("id,phone,display_name,created_at,updated_at")
      .eq("id", customerId)
      .maybeSingle(),
    admin
      .from("customer_addresses")
      .select(
        "id,label,address_text,reference,formatted_address,colony,latitude,longitude,delivery_fee,is_default,last_used_at"
      )
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("last_used_at", { ascending: false }),
    loadOrderMetrics(admin, [customerId]),
    loadLatestConversations(admin, [customerId]),
    loadDetailedOrders(admin, customerId),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (!customerResult.data) throw new Error("No se encontró el cliente");
  if (addressResult.error) throw addressResult.error;

  const customer = buildWhatsappCustomerSummaries(
    [customerSource(customerResult.data as CustomerRow)],
    metrics.map(orderMetricSource),
    conversations
  )[0];
  if (!customer) throw new Error("No se pudo preparar la ficha del cliente");

  const addresses = (addressResult.data ?? []).map((address) => ({
    id: address.id,
    label: address.label ?? "",
    addressText: address.address_text,
    reference: address.reference ?? "",
    formattedAddress: address.formatted_address ?? "",
    colony: address.colony ?? "",
    latitude: address.latitude === null ? null : Number(address.latitude),
    longitude: address.longitude === null ? null : Number(address.longitude),
    deliveryFee: address.delivery_fee === null ? null : Number(address.delivery_fee),
    isDefault: address.is_default,
    lastUsedAt: address.last_used_at,
  })) satisfies WhatsappCustomerAddress[];

  return { customer, addresses, orders };
}
