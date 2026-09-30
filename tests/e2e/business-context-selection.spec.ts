import { expect, test } from "@playwright/test";
import {
  canManageOrderPreparation,
  canDeleteBusinessOrderHistory,
  getCashAccessibleBusinessContexts,
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

test("solo el dueño del negocio puede borrar pedidos modernos del historial", () => {
  expect(
    canDeleteBusinessOrderHistory(
      { business_id: "mideli-id", capability_codes: ["business.operate_orders"], membership_role_code: "business_owner" },
      "admin",
    )
  ).toBe(true);
  expect(
    canDeleteBusinessOrderHistory(
      { business_id: "mideli-id", capability_codes: ["business.operate_orders"], membership_role_code: "global_waiter" },
      "supervisor",
    )
  ).toBe(false);
  expect(canDeleteBusinessOrderHistory(null, "waiter")).toBe(false);
  expect(canDeleteBusinessOrderHistory(null, "admin")).toBe(true);
});

test("la mesera global ve solo comedor de otros negocios y conserva su negocio local completo", () => {
  const contexts = [
    {
      business_id: "nuevo-local-id",
      capability_codes: ["business.operate_orders", "business.charge_orders"],
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
    { id: "other-dine-in", business_id: "nuevo-local-id", type: "comedor" },
    { id: "other-delivery", business_id: "nuevo-local-id", type: "domicilio" },
    { id: "other-takeout", business_id: "nuevo-local-id", type: "para_llevar" },
    { id: "local-delivery", business_id: "local-propio-id", type: "domicilio" },
  ];

  expect(
    filterOperationalOrdersByMembershipScope(orders, contexts).map(
      ({ id }) => id
    )
  ).toEqual(["other-dine-in", "local-delivery"]);
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
