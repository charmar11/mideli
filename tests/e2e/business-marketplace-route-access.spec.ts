import { expect, test } from "@playwright/test";
import { canUseAdminRoute } from "../../src/lib/multibusiness/admin-route-access";

test("el dueño del negocio puede abrir Plataformas con permiso de catálogo", () => {
  expect(
    canUseAdminRoute(
      "/settings/plataformas",
      "owner",
      ["business.manage_catalog"],
      true,
    ),
  ).toBe(true);
});

test("Rincón 404 puede abrir Plataformas para configurar un negocio", () => {
  expect(
    canUseAdminRoute(
      "/settings/plataformas",
      "admin",
      ["platform.manage_businesses"],
      true,
    ),
  ).toBe(true);
});

test("el personal sin permiso administrativo no puede abrir Plataformas", () => {
  expect(
    canUseAdminRoute(
      "/settings/plataformas",
      "waiter",
      ["organization.operate_orders"],
      true,
    ),
  ).toBe(false);
});

test("la cuenta administrativa sin multinegocio conserva su acceso anterior", () => {
  expect(canUseAdminRoute("/settings/plataformas", "admin", [], false)).toBe(true);
});
