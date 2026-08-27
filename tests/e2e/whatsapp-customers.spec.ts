import { expect, test } from "@playwright/test";
import {
  buildWhatsappCustomerSummaries,
  exactOrderNumberFromSearch,
  normalizeWhatsappCustomerSearch,
} from "@/lib/whatsapp/customers";

test.describe("directorio de clientes de WhatsApp", () => {
  test("normaliza búsquedas y reconoce un folio exacto", () => {
    expect(normalizeWhatsappCustomerSearch("  Pier's   3641% ")).toBe("Pier's 3641");
    expect(exactOrderNumberFromSearch("#123")).toBe(123);
    expect(exactOrderNumberFromSearch("+52 644 279 3641")).toBeNull();
    expect(exactOrderNumberFromSearch("pedido 123")).toBeNull();
  });

  test("calcula métricas reales sin sumar pedidos cancelados ni pendientes", () => {
    const [customer] = buildWhatsappCustomerSummaries(
      [{
        id: "customer-1",
        phone: "5216442793641",
        displayName: "Pier's",
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
      }],
      [
        {
          customerId: "customer-1",
          number: 103,
          status: "pending",
          paidAmount: 0,
          paymentStatus: "unpaid",
          createdAt: "2026-08-27T10:00:00.000Z",
        },
        {
          customerId: "customer-1",
          number: 102,
          status: "paid",
          paidAmount: 315,
          paymentStatus: "paid",
          createdAt: "2026-08-26T10:00:00.000Z",
        },
        {
          customerId: "customer-1",
          number: 101,
          status: "cancelled",
          paidAmount: 500,
          paymentStatus: "paid",
          createdAt: "2026-08-25T10:00:00.000Z",
        },
      ],
      [{
        customerId: "customer-1",
        id: "conversation-1",
        status: "active",
        updatedAt: "2026-08-27T10:10:00.000Z",
      }]
    );

    expect(customer).toMatchObject({
      orderCount: 2,
      paidOrderCount: 1,
      totalPaid: 315,
      lastOrderNumber: 103,
      lastConversationId: "conversation-1",
      lastConversationStatus: "active",
    });
  });

  test("ordena el directorio por la actividad comercial más reciente", () => {
    const customers = buildWhatsappCustomerSummaries(
      [
        { id: "old", phone: "5211111111111", displayName: "Anterior", createdAt: "2026-01-01", updatedAt: "2026-08-27" },
        { id: "recent", phone: "5212222222222", displayName: "Reciente", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      ],
      [{ customerId: "recent", number: 8, status: "paid", paidAmount: 100, paymentStatus: "paid", createdAt: "2026-08-28" }],
      []
    );

    expect(customers.map((customer) => customer.id)).toEqual(["recent", "old"]);
  });
});
