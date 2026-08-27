import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

test("la base acepta las etapas interactivas de edición y notas", () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260827233233_extend_whatsapp_interactive_stages.sql"
    ),
    "utf8"
  );
  const interactiveStages = [
    "awaiting_edit_action",
    "awaiting_edit_item",
    "awaiting_edit_quantity",
    "awaiting_edit_modifier_group",
    "awaiting_edit_modifier_option",
    "awaiting_edit_modifier_more",
    "awaiting_note_scope",
    "awaiting_note_item",
    "awaiting_note_quantity_scope",
    "awaiting_note_text",
  ];

  for (const stage of interactiveStages) {
    expect(migration).toContain(`'${stage}'`);
  }
});
