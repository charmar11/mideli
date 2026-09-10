import { expect, test } from "@playwright/test";
import {
  COMPACT_TABLE_PICKER_MAX_WIDTH,
  COMPACT_TABLE_PICKER_MEDIA_QUERY,
  shouldUseCompactTablePicker,
} from "@/lib/table-picker-layout";

test("el selector compacto cubre móvil y tablets en ambas orientaciones", () => {
  expect(COMPACT_TABLE_PICKER_MAX_WIDTH).toBe(1279);
  expect(shouldUseCompactTablePicker(390)).toBe(true);
  expect(shouldUseCompactTablePicker(768)).toBe(true);
  expect(shouldUseCompactTablePicker(1124)).toBe(true);
  expect(shouldUseCompactTablePicker(1023)).toBe(true);
  expect(shouldUseCompactTablePicker(1279)).toBe(true);
});

test("el selector amplio se reserva para escritorio grande", () => {
  expect(shouldUseCompactTablePicker(1280)).toBe(false);
  expect(shouldUseCompactTablePicker(1440)).toBe(false);
});

test("la detección inicial usa el mismo umbral que el cambio responsivo", () => {
  expect(COMPACT_TABLE_PICKER_MEDIA_QUERY).toBe("(max-width: 1279px)");
  expect(shouldUseCompactTablePicker(COMPACT_TABLE_PICKER_MAX_WIDTH)).toBe(true);
  expect(shouldUseCompactTablePicker(COMPACT_TABLE_PICKER_MAX_WIDTH + 1)).toBe(false);
});
