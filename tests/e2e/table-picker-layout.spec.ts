import { expect, test } from "@playwright/test";
import {
  COMPACT_TABLE_PICKER_MAX_WIDTH,
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
