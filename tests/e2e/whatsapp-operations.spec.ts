import { expect, test } from "@playwright/test";
import { isWhatsappBusinessOpen } from "../../src/lib/whatsapp/business-hours";
import { calculateDeliveryPrice } from "../../src/lib/whatsapp/delivery-pricing";

const rates = [
  { minDistanceKm: 0, maxDistanceKm: 4, fee: 30 },
  { minDistanceKm: 4, maxDistanceKm: 5, fee: 35 },
  { minDistanceKm: 14, maxDistanceKm: 15, fee: 90 },
];

const surcharges = [
  { colonyName: "Villa Bonita", aliases: ["Fraccionamiento Villa Bonita"], fee: 15 },
];

const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isOpen: true,
  opensAt: "12:00",
  closesAt: "23:00",
}));

test("calcula el rango por kilómetros y suma el recargo de colonia", () => {
  const quote = calculateDeliveryPrice({
    distanceMeters: 4_850,
    colony: "Fraccionamiento Villa Bonita",
    rates,
    surcharges,
  });
  expect(quote.status).toBe("quoted");
  if (quote.status !== "quoted") return;
  expect(quote.baseFee).toBe(35);
  expect(quote.surcharge).toBe(15);
  expect(quote.totalFee).toBe(50);
});

test("transfiere a atención humana cuando la distancia supera 15 km", () => {
  const quote = calculateDeliveryPrice({
    distanceMeters: 15_001,
    colony: "Centro",
    rates,
    surcharges,
  });
  expect(quote).toMatchObject({ status: "needs_handoff", reason: "outside_coverage" });
});

test("atiende pedidos solo de 12:00 a 23:00 en Hermosillo", () => {
  expect(
    isWhatsappBusinessOpen({
      now: new Date("2026-08-25T19:00:00.000Z"),
      timeZone: "America/Hermosillo",
      hours,
    })
  ).toBe(true);
  expect(
    isWhatsappBusinessOpen({
      now: new Date("2026-08-26T06:00:00.000Z"),
      timeZone: "America/Hermosillo",
      hours,
    })
  ).toBe(false);
});

test("una excepción cerrada tiene prioridad sobre el horario semanal", () => {
  expect(
    isWhatsappBusinessOpen({
      now: new Date("2026-08-25T20:00:00.000Z"),
      timeZone: "America/Hermosillo",
      hours,
      exceptions: [
        {
          serviceDate: "2026-08-25",
          isOpen: false,
          opensAt: null,
          closesAt: null,
        },
      ],
    })
  ).toBe(false);
});
