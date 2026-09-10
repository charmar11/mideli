import { expect, test } from "@playwright/test";
import {
  buildWhatsappCustomerSummaries,
  deduplicateWhatsappCustomerAddresses,
  exactOrderNumberFromSearch,
  normalizeWhatsappCustomerSearch,
} from "@/lib/whatsapp/customers";
import { whatsappActionErrorMessage } from "@/lib/whatsapp/action-errors";

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

  test("conserva los mensajes seguros de una RPC aunque Supabase los devuelva como objeto", () => {
    expect(
      whatsappActionErrorMessage(
        { code: "P0001", message: "No se puede eliminar este cliente porque tiene pedidos activos: 203" },
        "No se pudo completar la operación"
      )
    ).toBe("No se puede eliminar este cliente porque tiene pedidos activos: 203");
  });

  test("oculta domicilios equivalentes y conserva el confirmado más reciente", () => {
    const addresses = deduplicateWhatsappCustomerAddresses([
      {
        id: "captured",
        label: "Casa",
        addressText: "C. Yaqui 404, Col. Centro",
        reference: "Portón negro",
        formattedAddress: "Calle Yaqui 404, Centro, Ciudad Obregón",
        colony: "Centro",
        latitude: 27.5,
        longitude: -109.9,
        deliveryFee: 30,
        isDefault: false,
        confirmed: false,
        lastUsedAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "confirmed",
        label: "Casa principal",
        addressText: "Calle Yaqui 404, Centro",
        reference: "Portón negro",
        formattedAddress: "Calle Yaqui 404, Centro, Ciudad Obregón",
        colony: "Centro",
        latitude: 27.5,
        longitude: -109.9,
        deliveryFee: 30,
        isDefault: true,
        confirmed: true,
        lastUsedAt: "2026-08-02T10:00:00.000Z",
      },
    ]);

    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.id).toBe("confirmed");
  });
});
