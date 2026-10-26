export type DashboardNavigationItem = {
  href: string;
  match: (pathname: string) => boolean;
};

export type DashboardNavigationGroupId =
  | "turno"
  | "negocio"
  | "configuracion";

export type DashboardNavigationGroup<T extends DashboardNavigationItem> = {
  id: DashboardNavigationGroupId;
  label: string;
  items: T[];
};

const DASHBOARD_NAVIGATION_GROUPS: ReadonlyArray<{
  id: DashboardNavigationGroupId;
  label: string;
  hrefs: readonly string[];
}> = [
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
];

export function buildDashboardNavigationGroups<
  T extends DashboardNavigationItem,
>(items: readonly T[]): DashboardNavigationGroup<T>[] {
  const itemsByHref = new Map(items.map((item) => [item.href, item] as const));

  return DASHBOARD_NAVIGATION_GROUPS.flatMap((definition) => {
    const groupItems = definition.hrefs.flatMap((href) => {
      const item = itemsByHref.get(href);
      return item ? [item] : [];
    });

    return groupItems.length > 0
      ? [{ id: definition.id, label: definition.label, items: groupItems }]
      : [];
  });
}

export function getActiveDashboardNavigationGroupId<
  T extends DashboardNavigationItem,
>(
  groups: readonly DashboardNavigationGroup<T>[],
  pathname: string,
): DashboardNavigationGroupId | null {
  return (
    groups.find((group) => group.items.some((item) => item.match(pathname)))
      ?.id ?? null
  );
}
