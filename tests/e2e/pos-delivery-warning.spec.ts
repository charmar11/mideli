import { expect, test } from "@playwright/test";
import { getDeliveryWarningReviewLabel } from "@/lib/pos-delivery-warning";

test("revisa el domicilio cuando solo falta confirmar ubicación", () => {
  expect(getDeliveryWarningReviewLabel(true, false)).toBe("Revisar domicilio");
});

test("revisa el teléfono cuando solo falta el número del cliente", () => {
  expect(getDeliveryWarningReviewLabel(false, true)).toBe("Revisar teléfono");
});

test("nombra ambos datos cuando faltan ubicación y teléfono", () => {
  expect(getDeliveryWarningReviewLabel(true, true)).toBe("Revisar domicilio y teléfono");
});
