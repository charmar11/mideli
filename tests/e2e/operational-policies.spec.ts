import { expect, test } from "@playwright/test";
import {
  getPushTopicColumn,
  shouldSuppressPushBanner,
} from "@/lib/push-notification-policy";
import {
  canSendBusinessOrderNotification,
  canReceiveOrderNotificationEvent,
  canReceiveBusinessOrderNotification,
  capabilityBelongsToBusiness,
  getOrderNotificationDestination,
  isWaiterNotificationRole,
  membershipBelongsToBusiness,
} from "../../supabase/functions/_shared/order-notification-policy";
import {
  createRequestDeadline,
  getRealtimeReconnectDelay,
} from "@/lib/realtime-resilience";
import {
  buildBlindCashCountDisclosure,
  buildCashCloseBreakdown,
  validateOpeningFloatCorrection,
} from "@/lib/cash-close";
import {
  countsTowardLocalPendingBalance,
  hasRecordedMarketplaceCashReceipt,
  isLocalDeliveryOrder,
  isMarketplaceOrderSelection,
  marketplaceCashDifference,
  marketplacePaymentLabel,
  parseMarketplaceCashAmount,
  shouldCollectMarketplaceCash,
} from "@/lib/marketplace-orders";

test.describe("políticas de notificaciones", () => {
  test("cada tema usa una preferencia independiente", () => {
    expect(getPushTopicColumn("ready")).toBe("ready_alerts");
    expect(getPushTopicColumn("kitchen")).toBe("kitchen_alerts");
    expect(getPushTopicColumn("whatsapp_attention")).toBe("whatsapp_attention_alerts");
  });

  test("nunca descarta un Push aunque la vista responsable esté visible", () => {
    const clients = [
      {
        url: "https://mideli.example/dashboard/cocina",
        visibilityState: "visible" as const,
      },
    ];

    expect(shouldSuppressPushBanner("kitchen", clients)).toBe(false);
    expect(shouldSuppressPushBanner("ready", clients)).toBe(false);
    expect(
      shouldSuppressPushBanner("kitchen", [
        { ...clients[0], visibilityState: "hidden" },
      ])
    ).toBe(false);
  });

  test("cada aviso multinegocio respeta el negocio y el permiso requerido", () => {
    const organizationId = "org-1";
    const businessId = "business-1";

    expect(
      membershipBelongsToBusiness(
        { scope_type: "business", organization_id: organizationId, business_id: businessId },
        organizationId,
        businessId,
      ),
    ).toBe(true);
    expect(
      membershipBelongsToBusiness(
        { scope_type: "business", organization_id: organizationId, business_id: "business-2" },
        organizationId,
        businessId,
      ),
    ).toBe(false);
    expect(
      capabilityBelongsToBusiness(
        { capability_code: "business.operate_orders", organization_id: organizationId, business_id: "business-2" },
        organizationId,
        businessId,
      ),
    ).toBe(false);
    expect(
      capabilityBelongsToBusiness(
        { capability_code: "organization.operate_orders", organization_id: organizationId, business_id: null },
        organizationId,
        businessId,
      ),
    ).toBe(true);
    expect(canSendBusinessOrderNotification("new_order", ["organization.operate_orders"])).toBe(true);
    expect(canSendBusinessOrderNotification("in_preparation", ["business.operate_orders"])).toBe(false);
    expect(canSendBusinessOrderNotification("in_preparation", ["business.update_preparation"])).toBe(true);
    expect(canSendBusinessOrderNotification("ready", ["business.operate_orders"])).toBe(false);
    expect(canSendBusinessOrderNotification("ready", ["business.update_preparation"])).toBe(true);
  });

  test("la mesera global solo recibe avisos de comedor en negocios ajenos", () => {
    expect(canReceiveBusinessOrderNotification("comedor", true, false)).toBe(true);
    expect(canReceiveBusinessOrderNotification("domicilio", true, false)).toBe(false);
    expect(canReceiveBusinessOrderNotification("para_llevar", true, false)).toBe(false);
    expect(canReceiveBusinessOrderNotification("domicilio", true, true)).toBe(true);
    expect(canReceiveBusinessOrderNotification("domicilio", false, false)).toBe(true);
  });

  test("las meseras solo reciben Push cuando el pedido queda listo", () => {
    expect(isWaiterNotificationRole("global_waiter")).toBe(true);
    expect(isWaiterNotificationRole("local_waiter")).toBe(true);
    expect(isWaiterNotificationRole("business_owner")).toBe(false);
    expect(canReceiveOrderNotificationEvent("new_order", true)).toBe(false);
    expect(canReceiveOrderNotificationEvent("in_preparation", true)).toBe(false);
    expect(canReceiveOrderNotificationEvent("ready", true)).toBe(true);
    expect(canReceiveOrderNotificationEvent("new_order", false)).toBe(true);
    expect(canReceiveOrderNotificationEvent("in_preparation", false)).toBe(true);
    expect(canReceiveOrderNotificationEvent("ready", false)).toBe(true);
  });

  test("el aviso abre la pantalla que la persona tiene permiso para usar", () => {
    expect(
      getOrderNotificationDestination("new_order", "business-1", ["business.operate_orders"], "order-1"),
    ).toBe("/dashboard/mesero?mode=status&order=order-1");
    expect(
      getOrderNotificationDestination("new_order", "business-1", ["business.update_preparation"], "order-1"),
    ).toBe("/dashboard/cocina?order=order-1");
    expect(
      getOrderNotificationDestination(
        "in_preparation",
        "business-1",
        ["organization.operate_orders"],
        "order-1",
      ),
    ).toBe("/dashboard/mesero?mode=status&order=order-1");
  });
});

test.describe("resiliencia de Realtime", () => {
  test("el backoff crece y se limita a treinta segundos", () => {
    expect(getRealtimeReconnectDelay(0)).toBe(1500);
    expect(getRealtimeReconnectDelay(1)).toBe(3000);
    expect(getRealtimeReconnectDelay(2)).toBe(6000);
    expect(getRealtimeReconnectDelay(8)).toBe(30000);
  });

  test("el deadline cancela una solicitud colgada y puede liberarse", async () => {
    const deadline = createRequestDeadline(5);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(deadline.signal.aborted).toBe(true);

    const released = createRequestDeadline(20);
    released.clear();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(released.signal.aborted).toBe(false);
  });
});

test("el desglose de caja incluye el fondo inicial", () => {
  const breakdown = buildCashCloseBreakdown({
    openingFloat: 1000,
    cashTotal: 700,
    marketplaceCashTotal: 125,
    fundInTotal: 200,
    withdrawalTotal: 100,
    expenseTotal: 50,
    correctionTotal: 30,
  });

  expect(breakdown.expectedCash).toBe(1905);
  expect(breakdown.lines.map((line) => line.label)).toEqual([
    "Fondo inicial",
    "Ventas en efectivo",
    "Efectivo recibido de Didi Food",
    "Entradas",
    "Retiros",
    "Gastos",
    "Correcciones",
  ]);
});

test("Uber sólo admite pago en app y Didi permite app o efectivo", () => {
  expect(isMarketplaceOrderSelection({ platform: "uber_eats", paymentMode: "app" })).toBe(true);
  expect(isMarketplaceOrderSelection({ platform: "uber_eats", paymentMode: "cash" })).toBe(false);
  expect(isMarketplaceOrderSelection({ platform: "didi_food", paymentMode: "app" })).toBe(true);
  expect(isMarketplaceOrderSelection({ platform: "didi_food", paymentMode: "cash" })).toBe(true);
  expect(marketplacePaymentLabel("uber_eats", "app")).toBe("Pagado en la app");
  expect(marketplacePaymentLabel("didi_food", "cash")).toBe("Efectivo al repartidor");
});

test("sólo se solicita efectivo real al entregar un Didi pagado al repartidor", () => {
  expect(shouldCollectMarketplaceCash({ marketplace_platform: "didi_food", marketplace_payment_mode: "cash", marketplace_handed_off_at: null })).toBe(true);
  expect(shouldCollectMarketplaceCash({ marketplace_platform: "didi_food", marketplace_payment_mode: "cash", marketplace_handed_off_at: "2026-10-09T12:00:00Z" })).toBe(false);
  expect(shouldCollectMarketplaceCash({ marketplace_platform: "didi_food", marketplace_payment_mode: "app", marketplace_handed_off_at: null })).toBe(false);
  expect(shouldCollectMarketplaceCash({ marketplace_platform: "uber_eats", marketplace_payment_mode: "app", marketplace_handed_off_at: null })).toBe(false);
});

test("el efectivo de Didi queda identificado para conservarlo en caja al borrar la comanda", () => {
  expect(
    hasRecordedMarketplaceCashReceipt({
      marketplace_platform: "didi_food",
      marketplace_payment_mode: "cash",
      marketplace_handed_off_at: "2026-10-09T12:00:00Z",
      marketplace_cash_received: 180,
      marketplace_cash_shift_id: "shift-1",
    }),
  ).toBe(true);
  expect(
    hasRecordedMarketplaceCashReceipt({
      marketplace_platform: "didi_food",
      marketplace_payment_mode: "app",
      marketplace_handed_off_at: "2026-10-09T12:00:00Z",
      marketplace_cash_received: null,
      marketplace_cash_shift_id: null,
    }),
  ).toBe(false);
  expect(
    hasRecordedMarketplaceCashReceipt({
      marketplace_platform: "didi_food",
      marketplace_payment_mode: "cash",
      marketplace_handed_off_at: null,
      marketplace_cash_received: null,
      marketplace_cash_shift_id: null,
    }),
  ).toBe(false);
});

test("el efectivo de plataforma no se confunde con domicilio local", () => {
  expect(isLocalDeliveryOrder({
    type: "para_llevar",
    marketplace_platform: "didi_food",
  })).toBe(false);
  expect(isLocalDeliveryOrder({
    type: "domicilio",
    marketplace_platform: null,
  })).toBe(true);
});

test("un pedido de plataforma no se trata como saldo pendiente de cobro local", () => {
  expect(countsTowardLocalPendingBalance({ marketplace_platform: "uber_eats" })).toBe(false);
  expect(countsTowardLocalPendingBalance({ marketplace_platform: "didi_food" })).toBe(false);
  expect(countsTowardLocalPendingBalance({ marketplace_platform: null })).toBe(true);
});

test("el efectivo de Didi exige un peso entero válido y muestra diferencia contra el ticket", () => {
  expect(parseMarketplaceCashAmount("")).toMatchObject({ amount: null });
  expect(parseMarketplaceCashAmount("100.5")).toMatchObject({ amount: null });
  expect(parseMarketplaceCashAmount("1000001")).toMatchObject({ amount: null });
  expect(parseMarketplaceCashAmount("0")).toEqual({ amount: 0, error: null });
  expect(parseMarketplaceCashAmount("275")).toEqual({ amount: 275, error: null });
  expect(marketplaceCashDifference(300, 275)).toBe(-25);
});

test("el conteo ciego muestra el fondo sin revelar el efectivo esperado", () => {
  expect(buildBlindCashCountDisclosure(700)).toEqual({
    openingFloat: 700,
    expectedCash: null,
  });
});

test("la corrección del fondo exige un cambio real y un motivo", () => {
  expect(
    validateOpeningFloatCorrection({
      currentAmount: 700,
      nextAmount: 850,
      reason: "Corrección de captura",
    })
  ).toEqual({ amount: 850, reason: "Corrección de captura", error: null });

  expect(
    validateOpeningFloatCorrection({
      currentAmount: 700,
      nextAmount: 700,
      reason: "Sin cambio",
    }).error
  ).toBe("El nuevo fondo debe ser diferente al actual.");

  expect(
    validateOpeningFloatCorrection({
      currentAmount: 700,
      nextAmount: -1,
      reason: "Corrección de captura",
    }).error
  ).toBe("El fondo inicial no puede ser negativo.");
});
