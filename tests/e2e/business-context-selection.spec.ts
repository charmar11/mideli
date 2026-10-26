import { expect, test } from "@playwright/test";
import {
  cacheBusinessCatalog,
  clearBusinessCatalogCache,
  readBusinessCatalog,
} from "../../src/lib/catalog-cache";
import {
  canManageOrderPreparation,
  canAccessKitchenScreen,
  canDeleteBusinessOrderHistory,
  canDeleteBusinessOrderHistoryForType,
  requiresBusinessOwnerPinForOrderDeletion,
  getCashAccessibleBusinessContexts,
  getBusinessesMissingOpenCashShift,
  filterOperationalOrdersByMembershipScope,
  getOrderableBusinessContexts,
  getOrderReadableBusinessContexts,
  getMenuSelectableBusinessContexts,
  hasPlatformConsoleAccess,
  resolveBusinessBrandingContext,
  resolveBusinessContextSelection,
} from "../../src/lib/multibusiness/business-context-selection";

const mideliOwnerContext = {
  business_id: "mideli-id",
  capability_codes: ["business.manage_catalog", "organization.manage_tables"],
};

const justDippingSharedTablesContext = {
  business_id: "just-dipping-id",
  capability_codes: ["organization.manage_tables"],
};

test("conserva una caché independiente para volver rápido al menú de cada negocio", () => {
  clearBusinessCatalogCache();
  cacheBusinessCatalog("mideli-id", {
    categories: [{ name: "Hamburguesas" }],
    menuItems: [{ name: "Triple" }],
  }, 100);
  cacheBusinessCatalog("just-dipping-id", {
    categories: [{ name: "Box Combos" }],
    menuItems: [{ name: "Regular Box" }],
  }, 200);

  expect(readBusinessCatalog("mideli-id", 201)).toEqual({
    categories: [{ name: "Hamburguesas" }],
    menuItems: [{ name: "Triple" }],
  });
  expect(readBusinessCatalog("just-dipping-id", 201)).toEqual({
    categories: [{ name: "Box Combos" }],
    menuItems: [{ name: "Regular Box" }],
  });
  expect(readBusinessCatalog("mideli-id", 30_100)).toBeNull();
});

test("invalida catálogos almacenados al cambiar o actualizar datos", () => {
  clearBusinessCatalogCache();
  cacheBusinessCatalog("mideli-id", {
    categories: [{ name: "Hamburguesas" }],
    menuItems: [{ name: "Triple" }],
  }, 100);

  clearBusinessCatalogCache("mideli-id");

  expect(readBusinessCatalog("mideli-id", 101)).toBeNull();
});

test("una selección obsoleta de otro negocio vuelve al negocio autorizado", () => {
  const selected = resolveBusinessContextSelection(
    [justDippingSharedTablesContext, mideliOwnerContext],
    [],
    "just-dipping-id"
  );

  expect(selected?.business_id).toBe("mideli-id");
});

test("conserva el acceso de coordinación compartida al plano de mesas", () => {
  const selected = resolveBusinessContextSelection(
    [justDippingSharedTablesContext],
    [],
    "just-dipping-id"
  );

  expect(selected?.business_id).toBe("just-dipping-id");
});

test("prioriza el negocio en preparación autorizado frente al contexto compartido", () => {
  const justDippingSetupContext = {
    business_id: "just-dipping-id",
    capability_codes: ["business.manage_catalog", "business.manage_inventory"],
  };

  const selected = resolveBusinessContextSelection(
    [justDippingSharedTablesContext],
    [justDippingSetupContext],
    null
  );

  expect(selected?.business_id).toBe("just-dipping-id");
});

test("el dueño de Mideli solo ve su menú operativo, no el de Just Dipping", () => {
  const contexts = [
    {
      business_id: "mideli-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.operate_orders", "business.manage_catalog"],
    },
    {
      business_id: "just-dipping-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["organization.manage_tables"],
    },
  ];

  expect(getOrderableBusinessContexts(contexts).map(({ business_id }) => business_id)).toEqual([
    "mideli-id",
  ]);
});

test("el dueño conserva la marca Mideli aunque también tenga alcance organizacional", () => {
  const contexts = [
    {
      business_id: "mideli-id",
      capability_codes: ["business.manage_catalog", "organization.manage_tables"],
    },
    {
      business_id: "just-dipping-id",
      capability_codes: ["organization.manage_tables"],
    },
  ];

  expect(resolveBusinessBrandingContext(contexts)?.business_id).toBe("mideli-id");
});

test("la operación global conserva la marca Rincón 404 aunque vea un negocio", () => {
  const contexts = [
    {
      business_id: "mideli-id",
      capability_codes: ["business.manage_catalog", "organization.operate_orders"],
    },
  ];

  expect(resolveBusinessBrandingContext(contexts)).toBeNull();
});

test("la mesera global conserva los menús de todos los negocios activos", () => {
  const contexts = [
    {
      business_id: "mideli-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["organization.operate_orders"],
    },
    {
      business_id: "just-dipping-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["organization.operate_orders"],
    },
  ];

  expect(getOrderableBusinessContexts(contexts).map(({ business_id }) => business_id)).toEqual([
    "mideli-id",
    "just-dipping-id",
  ]);
});

test("la caja se ofrece por negocio autorizado aunque el menú actual sea de otro local", () => {
  const contexts = [
    {
      business_id: "just-dipping-id",
      business_display_name: "Just Dipping",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.operate_orders"],
    },
    {
      business_id: "mideli-id",
      business_display_name: "Mideli",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.operate_orders", "business.open_cash", "business.close_cash"],
    },
    {
      business_id: "unlicensed-id",
      business_display_name: "Otro local",
      business_lifecycle_status: "active" as const,
      business_license_available: false,
      capability_codes: ["business.open_cash"],
    },
  ];

  expect(getCashAccessibleBusinessContexts(contexts)).toEqual([
    {
      business_id: "mideli-id",
      business_display_name: "Mideli",
      canManageCash: false,
      canOpenCash: true,
      canCloseCash: true,
    },
  ]);
});

test("la caja cerrada de Mideli no bloquea un pedido de Just Dipping con su turno abierto", () => {
  expect(
    getBusinessesMissingOpenCashShift(
      ["just-dipping-id"],
      [{ business_id: "just-dipping-id", status: "open" }],
    ),
  ).toEqual([]);
});

test("una comanda de comedor requiere turno abierto en cada negocio incluido", () => {
  expect(
    getBusinessesMissingOpenCashShift(
      ["just-dipping-id", "mideli-id"],
      [
        { business_id: "just-dipping-id", status: "open" },
        { business_id: "mideli-id", status: "closed" },
      ],
    ),
  ).toEqual(["mideli-id"]);
});

test("la mesera global lee historial y estado por permisos locales aunque no tenga alcance organizacional", () => {
  const contexts = [
    {
      business_id: "mideli-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.operate_orders", "business.charge_orders"],
    },
    {
      business_id: "just-dipping-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.operate_orders", "business.charge_orders"],
    },
    {
      business_id: "unlicensed-id",
      business_lifecycle_status: "active" as const,
      business_license_available: false,
      capability_codes: ["business.operate_orders", "business.charge_orders"],
    },
    {
      business_id: "catalog-only-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.manage_catalog"],
    },
  ];

  expect(
    getOrderReadableBusinessContexts(contexts).map(({ business_id }) => business_id)
  ).toEqual(["mideli-id", "just-dipping-id"]);
});

test("la mesera global puede consultar comedor en locales sin acceso operativo", () => {
  const contexts = [
    {
      business_id: "autorizado-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.operate_orders", "business.charge_orders"],
      membership_scope_type: "organization" as const,
      membership_role_code: "global_waiter",
    },
    {
      business_id: "sin-acceso-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: [],
      membership_scope_type: "organization" as const,
      membership_role_code: "global_waiter",
    },
  ];

  expect(
    getOrderReadableBusinessContexts(contexts).map(({ business_id }) => business_id)
  ).toEqual(["autorizado-id", "sin-acceso-id"]);
});

test("el dueño borra directamente y el personal con permiso requiere PIN del dueño del mismo negocio", () => {
  const owner = {
    business_id: "mideli-id",
    capability_codes: ["business.operate_orders"],
    membership_role_code: "business_owner",
  };
  const localWaiter = {
    business_id: "mideli-id",
    capability_codes: ["business.operate_orders"],
    membership_scope_type: "business" as const,
    membership_role_code: "local_waiter",
  };
  const globalWaiter = {
    business_id: "just-dipping-id",
    capability_codes: ["business.operate_orders"],
    membership_scope_type: "organization" as const,
    membership_role_code: "global_waiter",
  };

  expect(
    canDeleteBusinessOrderHistory(owner, "admin")
  ).toBe(true);
  expect(requiresBusinessOwnerPinForOrderDeletion(owner)).toBe(false);
  expect(
    canDeleteBusinessOrderHistory(localWaiter, "waiter")
  ).toBe(true);
  expect(requiresBusinessOwnerPinForOrderDeletion(localWaiter)).toBe(true);
  expect(canDeleteBusinessOrderHistory(globalWaiter, "waiter")).toBe(true);
  expect(canDeleteBusinessOrderHistoryForType(globalWaiter, "comedor", "waiter")).toBe(true);
  expect(canDeleteBusinessOrderHistoryForType(globalWaiter, "para_llevar", "waiter")).toBe(false);
  expect(canDeleteBusinessOrderHistoryForType(localWaiter, "para_llevar", "waiter")).toBe(true);
  expect(requiresBusinessOwnerPinForOrderDeletion(globalWaiter)).toBe(true);
  expect(
    canDeleteBusinessOrderHistory(
      { business_id: "mideli-id", capability_codes: ["business.charge_orders"] },
      "waiter",
    )
  ).toBe(false);
  expect(
    canDeleteBusinessOrderHistory(
      { business_id: "mideli-id", capability_codes: ["business.operate_orders"] },
      "waiter",
    )
  ).toBe(true);
  expect(canDeleteBusinessOrderHistory(null, "waiter")).toBe(false);
  expect(canDeleteBusinessOrderHistory(null, "admin")).toBe(true);
  expect(requiresBusinessOwnerPinForOrderDeletion(null)).toBe(false);
});

test("la mesera global siempre ve solo comedor; el personal local conserva sus tipos de servicio", () => {
  const contexts = [
    {
      business_id: "autorizado-id",
      capability_codes: ["business.operate_orders", "business.charge_orders"],
      membership_scope_type: "organization" as const,
      membership_role_code: "global_waiter",
    },
    {
      business_id: "sin-acceso-id",
      capability_codes: [],
      membership_scope_type: "organization" as const,
      membership_role_code: "global_waiter",
    },
    {
      business_id: "preparacion-id",
      capability_codes: ["business.update_preparation", "business.access_kitchen"],
      membership_scope_type: "organization" as const,
      membership_role_code: "global_waiter",
    },
    {
      business_id: "local-propio-id",
      capability_codes: ["business.operate_orders", "business.charge_orders"],
      membership_scope_type: "business" as const,
      membership_role_code: "business_staff",
    },
  ];
  const orders = [
    { id: "authorized-dine-in", business_id: "autorizado-id", type: "comedor" },
    { id: "authorized-delivery", business_id: "autorizado-id", type: "domicilio" },
    { id: "authorized-takeout", business_id: "autorizado-id", type: "para_llevar" },
    { id: "authorized-uber", business_id: "autorizado-id", type: "para_llevar", marketplace_platform: "uber_eats" },
    { id: "authorized-didi", business_id: "autorizado-id", type: "para_llevar", marketplace_platform: "didi_food" },
    { id: "unauthorized-dine-in", business_id: "sin-acceso-id", type: "comedor" },
    { id: "unauthorized-delivery", business_id: "sin-acceso-id", type: "domicilio" },
    { id: "unauthorized-takeout", business_id: "sin-acceso-id", type: "para_llevar" },
    { id: "preparation-delivery", business_id: "preparacion-id", type: "domicilio" },
    { id: "local-delivery", business_id: "local-propio-id", type: "domicilio" },
  ];

  expect(
    filterOperationalOrdersByMembershipScope(orders, contexts).map(
      ({ id }) => id
    )
  ).toEqual([
    "authorized-dine-in",
    "unauthorized-dine-in",
    "local-delivery",
  ]);
});

test("solo el permiso de preparación permite cambiar los estados de cocina", () => {
  const globalWaiter = {
    business_id: "just-dipping-id",
    business_lifecycle_status: "active",
    business_license_available: true,
    capability_codes: ["business.operate_orders", "business.charge_orders"],
    membership_scope_type: "organization" as const,
    membership_role_code: "global_waiter",
  };
  const kitchenStaff = {
    business_id: "mideli-id",
    business_lifecycle_status: "active",
    business_license_available: true,
    capability_codes: ["business.update_preparation"],
    membership_scope_type: "business" as const,
    membership_role_code: "local_kitchen",
  };

  expect(canManageOrderPreparation(globalWaiter)).toBe(false);
  expect(canManageOrderPreparation(kitchenStaff)).toBe(true);
});

test("preparación desde Estado y pantalla Cocina son permisos independientes", () => {
  const statusOnly = {
    business_id: "just-dipping-id",
    business_lifecycle_status: "active",
    capability_codes: ["business.operate_orders", "business.update_preparation"],
  };
  const kitchenScreenOnly = {
    business_id: "mideli-id",
    business_lifecycle_status: "active",
    capability_codes: ["business.access_kitchen"],
  };
  const inactiveKitchenScreen = {
    ...kitchenScreenOnly,
    business_lifecycle_status: "paused",
  };

  expect(canManageOrderPreparation(statusOnly)).toBe(true);
  expect(canAccessKitchenScreen(statusOnly)).toBe(false);
  expect(canManageOrderPreparation(kitchenScreenOnly)).toBe(false);
  expect(canAccessKitchenScreen(kitchenScreenOnly)).toBe(true);
  expect(canAccessKitchenScreen(inactiveKitchenScreen)).toBe(false);
});

test("no muestra menús sin permiso de pedidos ni negocios que no estén activos", () => {
  const contexts = [
    {
      business_id: "setup-id",
      business_lifecycle_status: "draft" as const,
      business_license_available: false,
      capability_codes: ["business.manage_catalog", "organization.operate_orders"],
    },
    {
      business_id: "platform-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["platform.manage_businesses", "organization.manage_tables"],
    },
  ];

  expect(getOrderableBusinessContexts(contexts)).toEqual([]);
});

test("un negocio sin licencia no es operable, pero su opción autorizada queda visible", () => {
  const contexts = [
    {
      business_id: "mideli-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["organization.operate_orders"],
    },
    {
      business_id: "just-dipping-id",
      business_lifecycle_status: "active" as const,
      business_license_available: false,
      capability_codes: ["organization.operate_orders"],
    },
    {
      business_id: "other-id",
      business_lifecycle_status: "active" as const,
      business_license_available: true,
      capability_codes: ["business.manage_catalog"],
    },
  ];

  expect(getOrderableBusinessContexts(contexts).map(({ business_id }) => business_id)).toEqual([
    "mideli-id",
  ]);
  expect(getMenuSelectableBusinessContexts(contexts).map(({ business_id }) => business_id)).toEqual([
    "mideli-id",
    "just-dipping-id",
  ]);
});

test("reconoce al administrador de plataforma para enviarlo a su consola", () => {
  expect(hasPlatformConsoleAccess(["platform.manage_businesses"])).toBe(true);
  expect(hasPlatformConsoleAccess(["business.manage_catalog"])).toBe(false);
});
