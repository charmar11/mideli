import { expect, test } from "@playwright/test";
import {
  getPushTopicColumn,
  shouldSuppressPushBanner,
} from "@/lib/push-notification-policy";
import {
  createRequestDeadline,
  getRealtimeReconnectDelay,
} from "@/lib/realtime-resilience";
import {
  buildBlindCashCountDisclosure,
  buildCashCloseBreakdown,
  validateOpeningFloatCorrection,
} from "@/lib/cash-close";

test.describe("políticas de notificaciones", () => {
  test("cada tema usa una preferencia independiente", () => {
    expect(getPushTopicColumn("ready")).toBe("ready_alerts");
    expect(getPushTopicColumn("kitchen")).toBe("kitchen_alerts");
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
    fundInTotal: 200,
    withdrawalTotal: 100,
    expenseTotal: 50,
    correctionTotal: 30,
  });

  expect(breakdown.expectedCash).toBe(1780);
  expect(breakdown.lines.map((line) => line.label)).toEqual([
    "Fondo inicial",
    "Ventas en efectivo",
    "Entradas",
    "Retiros",
    "Gastos",
    "Correcciones",
  ]);
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
