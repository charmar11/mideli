import { expect, test } from "@playwright/test";
import {
  buildDashboardNavigationGroups,
  getActiveDashboardNavigationGroupId,
} from "../../src/lib/dashboard-navigation";

function navigationItem(href: string) {
  return {
    href,
    match: (pathname: string) =>
      pathname === href ||
      (href !== "/settings" && pathname.startsWith(`${href}/`)),
  };
}

const availableItems = [
  "/menu",
  "/settings",
  "/settings/negocios",
  "/settings/mesas",
  "/settings/clientes",
  "/settings/inventario",
  "/settings/caja",
  "/settings/impresion",
  "/settings/entregas",
  "/settings/plataformas",
  "/settings/diagnostico",
].map(navigationItem);

test("agrupa los accesos por tarea sin perder rutas administrativas", () => {
  const groups = buildDashboardNavigationGroups(availableItems);

  expect(
    groups.map((group) => ({
      id: group.id,
      label: group.label,
      hrefs: group.items.map((item) => item.href),
    }))
  ).toEqual([
    {
      id: "turno",
      label: "Turno",
      hrefs: ["/settings/caja", "/settings/entregas", "/settings/clientes"],
    },
    {
      id: "negocio",
      label: "Negocio",
      hrefs: ["/menu", "/settings", "/settings/inventario"],
    },
    {
      id: "configuracion",
      label: "Configuración",
      hrefs: [
        "/settings/plataformas",
        "/settings/impresion",
        "/settings/mesas",
        "/settings/negocios",
      ],
    },
  ]);

  expect(groups.flatMap((group) => group.items.map((item) => item.href))).not.toContain(
    "/settings/diagnostico"
  );
});

test("oculta las categorías vacías cuando los permisos filtran accesos", () => {
  const groups = buildDashboardNavigationGroups([
    navigationItem("/settings/inventario"),
  ]);

  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ id: "negocio", label: "Negocio" });
  expect(groups[0].items.map((item) => item.href)).toEqual([
    "/settings/inventario",
  ]);
});

test("identifica la categoría de la pantalla actual sin marcar páginas sueltas", () => {
  const groups = buildDashboardNavigationGroups(availableItems);

  expect(
    getActiveDashboardNavigationGroupId(groups, "/settings/entregas")
  ).toBe("turno");
  expect(
    getActiveDashboardNavigationGroupId(groups, "/settings/mesas/zonas")
  ).toBe("configuracion");
  expect(
    getActiveDashboardNavigationGroupId(groups, "/settings/diagnostico")
  ).toBeNull();
  expect(
    getActiveDashboardNavigationGroupId(groups, "/dashboard/mesero")
  ).toBeNull();
});
