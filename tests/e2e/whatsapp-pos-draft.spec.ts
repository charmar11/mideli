import { expect, test } from "@playwright/test";
import {
  distanceMetersToKilometers,
  normalizeWhatsappPosModifiers,
} from "@/lib/whatsapp/pos-draft";

test("normaliza las opciones del carrito de WhatsApp para Cocina", () => {
  expect(normalizeWhatsappPosModifiers([
    {
      groupId: "sabor",
      groupName: "Sabor",
      optionId: "bbq",
      optionName: "BBQ",
      price: 0,
    },
    {
      group_id: "presentacion",
      group: "Presentación",
      option_id: "papas",
      option: "Con papas",
      price: 30,
    },
  ])).toEqual([
    {
      group_id: "sabor",
      group: "Sabor",
      option_id: "bbq",
      option: "BBQ",
      price: 0,
    },
    {
      group_id: "presentacion",
      group: "Presentación",
      option_id: "papas",
      option: "Con papas",
      price: 30,
    },
  ]);
});

test("conserva la distancia de Maps y no convierte una distancia ausente en cero", () => {
  expect(distanceMetersToKilometers(2400)).toBe(2.4);
  expect(distanceMetersToKilometers("2400")).toBe(2.4);
  expect(distanceMetersToKilometers(0)).toBeNull();
  expect(distanceMetersToKilometers(null)).toBeNull();
});
