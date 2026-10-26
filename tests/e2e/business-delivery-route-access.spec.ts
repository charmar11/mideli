import { expect, test } from "@playwright/test";
import { canUseAdminRoute } from "../../src/lib/multibusiness/admin-route-access";

test("el dueño puede entrar a Entregas desde sus herramientas del local", () => {
  expect(
    canUseAdminRoute(
      "/settings/entregas",
      "owner",
      ["business.manage_catalog"],
      true,
    ),
  ).toBe(true);
});

test("Rincón 404 puede abrir la configuración de entregas de un negocio", () => {
  expect(
    canUseAdminRoute(
      "/settings/entregas",
      "admin",
      ["platform.manage_businesses"],
      true,
    ),
  ).toBe(true);
});

test("el personal sin permiso administrativo sigue sin acceso a Entregas", () => {
  expect(
    canUseAdminRoute(
      "/settings/entregas",
      "waiter",
      ["organization.operate_orders"],
      true,
    ),
  ).toBe(false);
});

test("la cuenta administrativa sin multinegocio conserva su acceso anterior", () => {
  expect(canUseAdminRoute("/settings/entregas", "admin", [], false)).toBe(true);
});
