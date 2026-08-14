import { expect, test } from "@playwright/test";
import {
  getPushTopicColumn,
  shouldSuppressPushBanner,
} from "@/lib/push-notification-policy";
import {
  createRequestDeadline,
  getRealtimeReconnectDelay,
} from "@/lib/realtime-resilience";
import { buildCashCloseBreakdown } from "@/lib/cash-close";

test.describe("políticas de notificaciones", () => {
  test("cada tema usa una preferencia independiente", () => {
    expect(getPushTopicColumn("ready")).toBe("ready_alerts");
    expect(getPushTopicColumn("kitchen")).toBe("kitchen_alerts");
  });

  test("solo suprime el banner cuando la vista responsable está visible", () => {
    const clients = [
      {
        url: "https://mideli.example/dashboard/cocina",
        visibilityState: "visible" as const,
      },
    ];

    expect(shouldSuppressPushBanner("kitchen", clients)).toBe(true);
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
