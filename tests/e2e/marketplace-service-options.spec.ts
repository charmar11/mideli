import { expect, test } from "@playwright/test";
import {
  getMarketplaceConfigBusinessId,
  getPickupChannelOptionState,
  isMarketplacePosConfigReady,
} from "@/lib/marketplace-orders";

test("solo usa canales de plataforma del negocio cuyo menú está activo", () => {
  expect(getMarketplaceConfigBusinessId("just-dipping-id", ["just-dipping-id"])).toBe("just-dipping-id");
  expect(getMarketplaceConfigBusinessId("mideli-id", ["just-dipping-id"])).toBeNull();
  expect(getMarketplaceConfigBusinessId("just-dipping-id", ["just-dipping-id", "mideli-id"])).toBeNull();
  expect(getMarketplaceConfigBusinessId(null, ["just-dipping-id"])).toBeNull();
});

test("no muestra configuracion anterior mientras carga otro negocio", () => {
  expect(isMarketplacePosConfigReady("just-dipping:key", "mideli:key", false)).toBe(false);
  expect(isMarketplacePosConfigReady("mideli:key", "mideli:key", true)).toBe(false);
  expect(isMarketplacePosConfigReady("mideli:key", "mideli:key", false)).toBe(true);
});

test("oculta Para llevar mientras el pedido es Domicilio local", () => {
  expect(getPickupChannelOptionState("domicilio", null)).toBe("hidden");
});

test("oculta Para llevar mientras el pedido es Comedor", () => {
  expect(getPickupChannelOptionState("comedor", null)).toBe("hidden");
});

test("selecciona Para llevar cuando no hay plataforma", () => {
  expect(getPickupChannelOptionState("para_llevar", null)).toBe("selected");
});

test("mantiene Para llevar disponible para quitar Uber Eats sin salir del pedido", () => {
  expect(getPickupChannelOptionState("para_llevar", {
    platform: "uber_eats",
    paymentMode: "app",
  })).toBe("available");
});

test("mantiene Para llevar disponible para quitar Didi Food sin salir del pedido", () => {
  expect(getPickupChannelOptionState("para_llevar", {
    platform: "didi_food",
    paymentMode: "app",
  })).toBe("available");
});

test("sirve los logos locales de Uber Eats y DiDi Food", async ({ request }) => {
  for (const logo of ["uber-eats.svg", "didi-food-white.svg"]) {
    const response = await request.get(`/marketplaces/${logo}`);

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
  }
});
