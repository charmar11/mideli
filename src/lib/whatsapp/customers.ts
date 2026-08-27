import type { WhatsappCustomerSummary } from "./admin-types";

export type WhatsappCustomerSource = {
  id: string;
  phone: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappCustomerOrderSource = {
  customerId: string | null;
  number: number;
  status: string;
  paidAmount: number;
  paymentStatus: string;
  createdAt: string;
};

export type WhatsappCustomerConversationSource = {
  customerId: string;
  id: string;
  status: string;
  updatedAt: string;
};

export function normalizeWhatsappCustomerSearch(value: string) {
  return value
    .trim()
    .slice(0, 80)
    .replace(/[%,*()_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function exactOrderNumberFromSearch(value: string) {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^\d{1,7}$/.test(normalized)) return null;
  const orderNumber = Number(normalized);
  return Number.isSafeInteger(orderNumber) && orderNumber > 0 ? orderNumber : null;
}

export function buildWhatsappCustomerSummaries(
  customers: WhatsappCustomerSource[],
  orders: WhatsappCustomerOrderSource[],
  conversations: WhatsappCustomerConversationSource[]
): WhatsappCustomerSummary[] {
  const ordersByCustomer = new Map<string, WhatsappCustomerOrderSource[]>();
  for (const order of orders) {
    if (!order.customerId || order.status === "cancelled") continue;
    const current = ordersByCustomer.get(order.customerId) ?? [];
    current.push(order);
    ordersByCustomer.set(order.customerId, current);
  }

  const latestConversation = new Map<string, WhatsappCustomerConversationSource>();
  for (const conversation of conversations) {
    const current = latestConversation.get(conversation.customerId);
    if (!current || conversation.updatedAt > current.updatedAt) {
      latestConversation.set(conversation.customerId, conversation);
    }
  }

  return customers
    .map((customer) => {
      const customerOrders = ordersByCustomer.get(customer.id) ?? [];
      customerOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const paidOrders = customerOrders.filter((order) => order.paymentStatus === "paid");
      const conversation = latestConversation.get(customer.id);
      return {
        id: customer.id,
        phone: customer.phone,
        displayName: customer.displayName.trim(),
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        orderCount: customerOrders.length,
        paidOrderCount: paidOrders.length,
        totalPaid: paidOrders.reduce((total, order) => total + order.paidAmount, 0),
        lastOrderAt: customerOrders[0]?.createdAt ?? null,
        lastOrderNumber: customerOrders[0]?.number ?? null,
        lastConversationId: conversation?.id ?? null,
        lastConversationStatus: conversation?.status ?? "",
      };
    })
    .sort((a, b) => {
      const aActivity = a.lastOrderAt ?? a.updatedAt;
      const bActivity = b.lastOrderAt ?? b.updatedAt;
      return bActivity.localeCompare(aActivity);
    });
}
