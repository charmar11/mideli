import { expect, test } from "@playwright/test";
import { toggleComboOptionSelection } from "@/lib/combo-selection";

test("permite quitar una opción de combo al volver a tocarla", () => {
  const selected = toggleComboOptionSelection({}, "cambio", "mac-cheese");

  expect(
    toggleComboOptionSelection(selected, "cambio", "mac-cheese"),
  ).toEqual({});
});

test("cambiar la opción conserva una sola elección por grupo", () => {
  const selected = toggleComboOptionSelection({}, "cambio", "mac-cheese");

  expect(
    toggleComboOptionSelection(selected, "cambio", "extra-fries"),
  ).toEqual({ cambio: "extra-fries" });
});
