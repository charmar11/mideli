import { expect, test } from "@playwright/test";
import {
  addressQueryCandidates,
  normalizeAddressQuery,
  selectConfidentAddressResult,
} from "../../src/lib/whatsapp/address-confidence";
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

test("normaliza calle, número y colonia antes de consultar Google", () => {
  expect(normalizeAddressQuery("Sinagogas 1230, col san xavier")).toBe(
    "Sinagogas, 1230, san xavier"
  );
  expect(normalizeAddressQuery("Las Palmas, 1747, colonia Villas del Palmar")).toBe(
    "Las Palmas, 1747, Villas del Palmar"
  );
  expect(addressQueryCandidates("Sinagogas 1230, col san xavier")).toEqual([
    "Sinagogas, 1230, san xavier",
    "Sinagogas 1230, col san xavier",
  ]);
});

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

test("usa el texto original para reconocer un recargo de colonia", () => {
  const quote = calculateDeliveryPrice({
    distanceMeters: 4_850,
    colony: "Cajeme",
    colonySearchText: "Calle Uno 123, Fraccionamiento Villa Bonita",
    rates,
    surcharges,
  });
  expect(quote).toMatchObject({
    status: "quoted",
    surcharge: 15,
    totalFee: 50,
  });
});

test("descarta un parque y elige la dirección que coincide con calle y número", () => {
  const selected = selectConfidentAddressResult(
    "Las Palmas 1747, colonia Villas del Palmar",
    [
      {
        formatted_address: "Parque Villa del Palmar, Ciudad Obregón, Sonora",
        types: ["park", "point_of_interest", "establishment"],
        geometry: {
          location: { lat: 27.5, lng: -109.9 },
          location_type: "GEOMETRIC_CENTER",
        },
      },
      {
        formatted_address: "Las Palmas 1747, Villas del Palmar, Ciudad Obregón, Sonora",
        types: ["street_address"],
        geometry: {
          location: { lat: 27.51, lng: -109.91 },
          location_type: "ROOFTOP",
        },
        address_components: [
          { long_name: "1747", types: ["street_number"] },
          { long_name: "Las Palmas", types: ["route"] },
          { long_name: "Villas del Palmar", types: ["sublocality_level_1"] },
          { long_name: "Ciudad Obregón", types: ["locality"] },
        ],
      },
    ]
  );
  expect(selected.formatted_address).toContain("Las Palmas 1747");
});

test("no acepta un punto de interés como domicilio aunque sea el único resultado", () => {
  expect(() =>
    selectConfidentAddressResult("Las Palmas 1747, Villas del Palmar", [
      {
        formatted_address: "Parque Villa del Palmar, Ciudad Obregón, Sonora",
        types: ["park", "point_of_interest"],
        geometry: {
          location: { lat: 27.5, lng: -109.9 },
          location_type: "GEOMETRIC_CENTER",
        },
      },
    ])
  ).toThrow("address_low_confidence");
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
