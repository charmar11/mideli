import type { WhatsappAdminConversation } from "./admin-types";

export type WhatsappInboxFilter = "attention" | "active" | "closed" | "all";

export const WHATSAPP_INBOX_FILTERS: Array<{
  id: WhatsappInboxFilter;
  label: string;
}> = [
  { id: "attention", label: "Por atender" },
  { id: "active", label: "Activas" },
  { id: "closed", label: "Cerradas" },
  { id: "all", label: "Todas" },
];

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filterMatches(
  conversation: WhatsappAdminConversation,
  filter: WhatsappInboxFilter
) {
  if (filter === "attention") return conversation.status === "handoff";
  if (filter === "active") {
    return conversation.status === "active" || conversation.status === "confirmed";
  }
  if (filter === "closed") {
    return conversation.status === "closed" || conversation.status === "cancelled";
  }
  return true;
}

function priority(conversation: WhatsappAdminConversation) {
  if (conversation.status === "handoff") return 0;
  if (conversation.status === "active") return 1;
  if (conversation.status === "confirmed") return 2;
  return 3;
}

export function filterWhatsappConversations(
  conversations: WhatsappAdminConversation[],
  filter: WhatsappInboxFilter,
  query: string
) {
  const cleanQuery = normalized(query);
  const queryDigits = query.replace(/\D/g, "");

  return conversations
    .filter((conversation) => filterMatches(conversation, filter))
    .filter((conversation) => {
      if (!cleanQuery && !queryDigits) return true;
      const orderNumber = conversation.latestOrder?.number
        ? String(conversation.latestOrder.number)
        : "";
      const haystack = normalized(
        [
          conversation.customerName,
          conversation.phone,
          conversation.lastMessage,
          orderNumber,
        ].join(" ")
      );
      return (
        (cleanQuery ? haystack.includes(cleanQuery) : false) ||
        (queryDigits ? conversation.phone.includes(queryDigits) : false)
      );
    })
    .toSorted((left, right) => {
      const priorityDifference = priority(left) - priority(right);
      if (priorityDifference !== 0) return priorityDifference;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}

export function whatsappConversationStatus(status: string) {
  if (status === "handoff") {
    return { label: "Por atender", tone: "warning" as const };
  }
  if (status === "active") {
    return { label: "Bot atendiendo", tone: "success" as const };
  }
  if (status === "confirmed") {
    return { label: "Pedido confirmado", tone: "brand" as const };
  }
  if (status === "cancelled") {
    return { label: "Cancelada", tone: "danger" as const };
  }
  return { label: "Cerrada", tone: "muted" as const };
}

export function whatsappOrderStatus(status: string, deliveryStatus: string) {
  if (deliveryStatus === "driver_on_way") return "Repartidor en camino";
  if (deliveryStatus === "searching_driver") return "Buscando repartidor";
  if (deliveryStatus === "customer_received") return "Recibido por el cliente";
  if (status === "pending") return "Recibido";
  if (status === "in_kitchen") return "En preparación";
  if (status === "ready") return "Listo";
  if (status === "served") return "Entregado";
  if (status === "paid") return "Cobrado";
  if (status === "cancelled") return "Cancelado";
  return "Sin estado";
}

export function whatsappMessageStatus(status: string) {
  if (status === "received") return "Recibido";
  if (status === "processing") return "Procesando";
  if (status === "sent") return "Enviado";
  if (status === "delivered") return "Entregado";
  if (status === "read") return "Leído";
  if (status === "failed") return "No enviado";
  if (status === "ignored") return "Ignorado";
  return status;
}
