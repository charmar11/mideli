import { expect, test } from "@playwright/test";
import { getUnavailableMarketplaceProductNames } from "@/lib/marketplace-orders";

test("una plataforma solo acepta los productos marcados como disponibles", () => {
  const products = [
    { menu_item_id: "regular-box", name: "Regular Box" },
    { menu_item_id: "munchies-fries", name: "Munchies fries" },
  ];
  const availability = {
    "regular-box": { uber_eats: true, didi_food: false },
    "munchies-fries": { uber_eats: false, didi_food: false },
  };

  expect(getUnavailableMarketplaceProductNames("uber_eats", products, availability)).toEqual([
    "Munchies fries",
  ]);
  expect(getUnavailableMarketplaceProductNames("didi_food", products, availability)).toEqual([
    "Regular Box",
    "Munchies fries",
  ]);
});

test("un producto nuevo sin configuración se considera no disponible", () => {
  expect(
    getUnavailableMarketplaceProductNames(
      "uber_eats",
      [{ menu_item_id: "new-product", name: "Producto nuevo" }],
      {},
    ),
  ).toEqual(["Producto nuevo"]);
});
