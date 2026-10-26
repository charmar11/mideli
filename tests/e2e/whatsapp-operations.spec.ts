import { expect, test } from "@playwright/test";
import {
  addressQueryCandidates,
  extractAddressCoordinates,
  extractColonyFromAddressText,
  extractColonyFromResult,
  normalizeAddressQuery,
  selectConfidentAddressResult,
} from "../../src/lib/whatsapp/address-confidence";
import { isWhatsappBusinessOpen } from "../../src/lib/whatsapp/business-hours";
import {
  calculateDeliveryPrice,
  resolveDeliveryColonyPricing,
  UNREGISTERED_DELIVERY_COLONY,
} from "../../src/lib/whatsapp/delivery-pricing";
import { normalizeAddressForComparison } from "../../src/lib/whatsapp/normalize";

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

test("considera iguales las variantes de un domicilio canónico", () => {
  expect(
    normalizeAddressForComparison("C. Las Palmas 1747, Villas del Palmar, Ciudad Obregón")
  ).toBe(
    normalizeAddressForComparison("Las Palmas 1747, Villas del Palmar, Ciudad Obregón")
  );
});

test("normaliza calle, número y colonia antes de consultar Google", () => {
  expect(normalizeAddressQuery("Sinagogas 1230, col san xavier")).toBe(
    "Sinagogas, 1230, san xavier"
  );
  expect(normalizeAddressQuery("Las Palmas, 1747, colonia Villas del Palmar")).toBe(
    "Las Palmas, 1747, Villas del Palmar"
  );
  expect(normalizeAddressQuery("Las Palmas 1747 col, Villas del Palmar")).toBe(
    "Las Palmas, 1747, Villas del Palmar"
  );
  expect(addressQueryCandidates("Sinagogas 1230, col san xavier")).toEqual([
    "Sinagogas, 1230, san xavier",
    "Sinagogas 1230, col san xavier",
  ]);
});

test("detecta fraccionamientos que Google entrega como área administrativa o texto etiquetado", () => {
  expect(
    extractColonyFromResult({
      formatted_address: "Calle Puente de Rialto 1430, Puente Real, Ciudad Obregón, Sonora",
      address_components: [
        { long_name: "Puente Real", types: ["administrative_area_level_3", "political"] },
        { long_name: "Ciudad Obregón", types: ["locality", "political"] },
        { long_name: "Cajeme", types: ["administrative_area_level_2", "political"] },
      ],
    })
  ).toBe("Puente Real");

  expect(
    extractColonyFromResult({
      formatted_address: "Calle Puente de Rialto 1430, Fraccionamiento Puente Real, Ciudad Obregón",
    })
  ).toBe("Puente Real");
});

test("prefiere la colonia en la dirección antes que la demarcación administrativa", () => {
  expect(
    extractColonyFromResult({
      formatted_address:
        "Av. Miguel Alemán 162, Centro, Fundo Legal, 85000 Cdad. Obregón, Son.",
      address_components: [
        { long_name: "162", types: ["street_number"] },
        { long_name: "Avenida Miguel Alemán", types: ["route"] },
        { long_name: "Fundo Legal", types: ["administrative_area_level_3", "political"] },
        { long_name: "85000", types: ["postal_code"] },
        { long_name: "Ciudad Obregón", types: ["locality", "political"] },
        { long_name: "Cajeme", types: ["administrative_area_level_2", "political"] },
        { long_name: "Sonora", types: ["administrative_area_level_1", "political"] },
      ],
    })
  ).toBe("Centro");
});

test("recupera una colonia escrita explícitamente en el mismo campo del domicilio", () => {
  expect(extractColonyFromAddressText("Calle Puente de Rialto 1430, Fracc. Puente Real, Cajeme"))
    .toBe("Puente Real");
  expect(extractColonyFromAddressText("C. Yaqui 404, Colonia Norte, Ciudad Obregón"))
    .toBe("Norte");
  expect(extractColonyFromAddressText("Calle Puente de Rialto 1430, Puente Real, Cajeme"))
    .toBe("");
});

test("lee coordenadas de enlaces y ubicaciones comunes de Google Maps", () => {
  expect(extractAddressCoordinates(
    "https://www.google.com/maps/search/?api=1&query=27.503311%2C-109.936335"
  )).toEqual({ latitude: 27.503311, longitude: -109.936335 });
  expect(extractAddressCoordinates(
    "https://maps.google.com/@27.503311,-109.936335,17z"
  )).toEqual({ latitude: 27.503311, longitude: -109.936335 });
  expect(extractAddressCoordinates(
    "https://www.google.com/maps/place/Casa/data=!3d27.503311!4d-109.936335"
  )).toEqual({ latitude: 27.503311, longitude: -109.936335 });
  expect(extractAddressCoordinates("27.503311, -109.936335"))
    .toEqual({ latitude: 27.503311, longitude: -109.936335 });
  expect(extractAddressCoordinates("Calle Yaqui 404, CP 85000")).toBeNull();
  expect(extractAddressCoordinates("query=127.503311,-109.936335")).toBeNull();
});

test("reconoce las variantes habituales de zonas residenciales", () => {
  const variants = [
    ["Colonia Centro", "Centro"],
    ["Residencial Las Palmas", "Las Palmas"],
    ["Privada Los Arcos", "Los Arcos"],
    ["Condominio Los Pinos", "Los Pinos"],
    ["Barrio Norte", "Norte"],
    ["Comunidad El Campito", "El Campito"],
    ["Conjunto residencial Los Olivos", "Los Olivos"],
    ["Unidad habitacional Las Flores", "Las Flores"],
    ["Sección: Centro", "Centro"],
    ["Fracc. Puerta Real", "Puerta Real"],
  ] as const;

  for (const [formattedAddress, expected] of variants) {
    expect(
      extractColonyFromResult({ formatted_address: `${formattedAddress}, Ciudad Obregón, Sonora` })
    ).toBe(expected);
  }
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

test("mantiene bloqueada la cotización sin colonia hasta que el operador elija la excepción", () => {
  expect(resolveDeliveryColonyPricing({
    colony: "",
    address: "C. Puente de Rialto 143",
    allowUnregisteredColony: false,
  })).toEqual({ status: "confirmation_required" });
});

test("cotiza una calle sin colonia oficial por distancia y no aplica recargo de zona", () => {
  const colonyPricing = resolveDeliveryColonyPricing({
    colony: "",
    address: "Calle Villa Bonita 123, C. Puente de Rialto 143",
    allowUnregisteredColony: true,
  });

  expect(colonyPricing).toEqual({
    status: "unregistered",
    colony: "",
    colonySearchText: "",
    displayColony: UNREGISTERED_DELIVERY_COLONY,
  });

  if (colonyPricing.status !== "unregistered") return;
  expect(calculateDeliveryPrice({
    distanceMeters: 4_850,
    colony: colonyPricing.colony,
    colonySearchText: colonyPricing.colonySearchText,
    rates,
    surcharges,
  })).toMatchObject({
    status: "quoted",
    baseFee: 35,
    surcharge: 0,
    totalFee: 35,
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

test("rechaza un resultado seleccionado cuya calle y número no coinciden con el texto", () => {
  expect(() => selectConfidentAddressResult("Puente de Rialto 1430", [
    {
      formatted_address: "Puente de Rialto 1340, Puente Real, Ciudad Obregón, Sonora",
      types: ["street_address"],
      geometry: {
        location: { lat: 27.5, lng: -109.9 },
        location_type: "ROOFTOP",
      },
      address_components: [
        { long_name: "1340", types: ["street_number"] },
        { long_name: "Puente de Rialto", types: ["route"] },
        { long_name: "Puente Real", types: ["sublocality_level_1"] },
        { long_name: "Ciudad Obregón", types: ["locality"] },
      ],
    },
  ])).toThrow("address_low_confidence");
});

test("compara también la calle y no confunde su número con el exterior", () => {
  const selected = selectConfidentAddressResult("Calle 5 123, Fracc. Puente Real", [
    {
      formatted_address: "Calle 5 123, Puente Real, Ciudad Obregón, Sonora",
      types: ["street_address"],
      geometry: {
        location: { lat: 27.5, lng: -109.9 },
        location_type: "ROOFTOP",
      },
      address_components: [
        { long_name: "123", types: ["street_number"] },
        { long_name: "Calle 5", types: ["route"] },
        { long_name: "Puente Real", types: ["sublocality_level_1"] },
        { long_name: "Ciudad Obregón", types: ["locality"] },
      ],
    },
  ]);
  expect(selected.formatted_address).toContain("Calle 5 123");

  expect(() => selectConfidentAddressResult("Calle Yaqui 123", [
    {
      formatted_address: "Calle Las Palmas 123, Ciudad Obregón, Sonora",
      types: ["street_address"],
      geometry: {
        location: { lat: 27.5, lng: -109.9 },
        location_type: "ROOFTOP",
      },
      address_components: [
        { long_name: "123", types: ["street_number"] },
        { long_name: "Las Palmas", types: ["route"] },
        { long_name: "Ciudad Obregón", types: ["locality"] },
      ],
    },
  ])).toThrow("address_low_confidence");
});

test("acepta una plaza o parque nombrado aunque no tenga número exterior", () => {
  const selected = selectConfidentAddressResult("Parque Villa del Palmar, Ciudad Obregón", [
    {
      formatted_address: "Parque Villa del Palmar, Ciudad Obregón, Sonora",
      types: ["park", "point_of_interest"],
      geometry: {
        location: { lat: 27.5, lng: -109.9 },
        location_type: "GEOMETRIC_CENTER",
      },
      address_components: [
        { long_name: "Villa del Palmar", types: ["sublocality_level_1"] },
        { long_name: "Ciudad Obregón", types: ["locality"] },
      ],
    },
  ]);

  expect(selected.formatted_address).toContain("Parque Villa del Palmar");
});

test("sigue pidiendo número cuando Google solo devuelve una zona amplia", () => {
  expect(() =>
    selectConfidentAddressResult("Villas del Palmar, Ciudad Obregón", [
      {
        formatted_address: "Villas del Palmar, Ciudad Obregón, Sonora",
        types: ["sublocality", "political"],
        geometry: {
          location: { lat: 27.5, lng: -109.9 },
          location_type: "APPROXIMATE",
        },
      },
    ])
  ).toThrow("address_number_required");
});

test("acepta como candidato confirmable un domicilio numerado aunque Google lo marque aproximado", () => {
  const selected = selectConfidentAddressResult(
    "Las Palmas 1747, Villas del Palmar",
    [
      {
        formatted_address: "C. Las Palmas 1747, Villas del Palmar, Ciudad Obregón, Sonora",
        partial_match: true,
        types: ["street_address"],
        geometry: {
          location: { lat: 27.51, lng: -109.91 },
          location_type: "APPROXIMATE",
        },
        address_components: [
          { long_name: "1747", types: ["street_number"] },
          { long_name: "Calle Las Palmas", types: ["route"] },
          { long_name: "Villas del Palmar", types: ["sublocality_level_1"] },
          { long_name: "Ciudad Obregón", types: ["locality"] },
        ],
      },
    ]
  );

  expect(selected.formatted_address).toContain("1747");
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
