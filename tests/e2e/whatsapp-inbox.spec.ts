import { expect, test } from "@playwright/test";
import type { WhatsappAdminConversation } from "../../src/lib/whatsapp/admin-types";
import {
  filterWhatsappConversations,
  whatsappConversationStatus,
  whatsappMessageStatus,
  whatsappOrderStatus,
} from "../../src/lib/whatsapp/inbox";

function conversation(
  input: Partial<WhatsappAdminConversation> & Pick<WhatsappAdminConversation, "id">
): WhatsappAdminConversation {
  const { id, ...overrides } = input;
  return {
    id,
    phone: "5216442793641",
    customerName: "",
    status: "active",
    stage: "ordering",
    botEnabled: true,
    assignedTo: null,
    assignedName: "",
    handoffReason: "",
    updatedAt: "2026-08-27T05:00:00.000Z",
    lastInboundAt: null,
    lastOutboundAt: null,
    lastMessage: "Hola",
    lastMessageDirection: "inbound",
    lastMessageStatus: "received",
    latestOrder: null,
    context: {
      items: [],
      total: 0,
      serviceType: null,
      address: "",
      addressReference: "",
      paymentMethod: "",
    },
    ...overrides,
  };
}

test("prioriza conversaciones que esperan al equipo", () => {
  const result = filterWhatsappConversations([
    conversation({ id: "active", updatedAt: "2026-08-27T06:00:00.000Z" }),
    conversation({ id: "handoff", status: "handoff", botEnabled: false }),
    conversation({ id: "closed", status: "closed", botEnabled: false }),
  ], "all", "");

  expect(result.map((item) => item.id)).toEqual(["handoff", "active", "closed"]);
});

test("busca por nombre, teléfono y folio", () => {
  const conversations = [conversation({
    id: "one",
    customerName: "María López",
    latestOrder: {
      id: "order",
      number: 418,
      status: "ready",
      type: "domicilio",
      total: 259,
      paymentStatus: "unpaid",
      deliveryStatus: "searching_driver",
      deliveryAddress: "Sinagogas 1230",
      deliveryReference: "Casa blanca",
      paymentMethod: "efectivo",
      requestedCashTendered: 300,
      createdAt: "2026-08-27T05:00:00.000Z",
    },
  })];

  expect(filterWhatsappConversations(conversations, "all", "maria")).toHaveLength(1);
  expect(filterWhatsappConversations(conversations, "all", "279 3641")).toHaveLength(1);
  expect(filterWhatsappConversations(conversations, "all", "418")).toHaveLength(1);
  expect(filterWhatsappConversations(conversations, "all", "otro")).toHaveLength(0);
});

test("separa conversaciones activas y cerradas", () => {
  const conversations = [
    conversation({ id: "active" }),
    conversation({ id: "confirmed", status: "confirmed" }),
    conversation({ id: "closed", status: "closed" }),
    conversation({ id: "cancelled", status: "cancelled" }),
  ];

  expect(filterWhatsappConversations(conversations, "active", "").map((item) => item.id))
    .toEqual(["active", "confirmed"]);
  expect(filterWhatsappConversations(conversations, "closed", "").map((item) => item.id))
    .toEqual(["closed", "cancelled"]);
});

test("traduce estados operativos para el equipo", () => {
  expect(whatsappConversationStatus("handoff").label).toBe("Por atender");
  expect(whatsappMessageStatus("read")).toBe("Leído");
  expect(whatsappMessageStatus("failed")).toBe("No enviado");
  expect(whatsappOrderStatus("ready", "searching_driver")).toBe("Buscando repartidor");
  expect(whatsappOrderStatus("ready", "driver_on_way")).toBe("Repartidor en camino");
});
