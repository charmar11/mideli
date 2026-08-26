import { expect, test } from "@playwright/test";
import { isMissingWhatsappSchema } from "../../src/lib/whatsapp/schema-compat";

test("reconoce tablas y columnas pendientes en PostgREST", () => {
  expect(isMissingWhatsappSchema({ code: "PGRST205" })).toBe(true);
  expect(isMissingWhatsappSchema({ code: "42703" })).toBe(true);
  expect(isMissingWhatsappSchema({ code: "42P01" })).toBe(true);
  expect(isMissingWhatsappSchema({ code: "42883" })).toBe(true);
});

test("no oculta errores reales de base de datos", () => {
  expect(isMissingWhatsappSchema({ code: "42501" })).toBe(false);
  expect(isMissingWhatsappSchema(null)).toBe(false);
});
