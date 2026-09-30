"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { Drawer } from "@base-ui/react/drawer";
import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  Boxes,
  ChefHat,
  ChevronDown,
  ClipboardList,
  HelpCircle,
  Landmark,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  Printer,
  Settings,
  SlidersHorizontal,
  Stethoscope,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { RoleOnboardingTour } from "@/components/onboarding/role-onboarding-tour";
import { getBusinessLogoUrl } from "@/lib/business-branding";
import {
  getSelectableBusinessContexts,
  resolveBusinessBrandingContext,
} from "@/lib/multibusiness/business-context-selection";
import { createClient } from "@/lib/supabase/client";
import { DashboardUserProvider } from "@/components/dashboard/dashboard-user-context";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import { useCartStore } from "@/lib/stores/cart-store";
import type { Profile } from "@/types/database";
import type { BusinessContextRow } from "@/types/multibusiness";

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
};

const POS_ITEM: NavItem = {
  href: "/dashboard/mesero",
  label: "Mesero",
  icon: UtensilsCrossed,
  match: (path) => path === "/dashboard/mesero",
};

const KITCHEN_ITEM: NavItem = {
  href: "/dashboard/cocina",
  label: "Cocina",
  icon: ChefHat,
  match: (path) => path === "/dashboard/cocina",
};

const ANALYTICS_ITEM: NavItem = {
  href: "/dashboard/analiticas",
  label: "Analíticas",
  icon: BarChart3,
  match: (path) => path === "/dashboard/analiticas",
};

const WHATSAPP_ITEM: NavItem = {
  href: "/dashboard/whatsapp",
  label: "WhatsApp",
  icon: MessagesSquare,
  match: (path) => path === "/dashboard/whatsapp",
};

const ADMIN_ITEMS: NavItem[] = [
  {
    href: "/menu",
    label: "Menú",
    description: "Platillos y categorías",
    icon: ClipboardList,
    match: (path) => path.startsWith("/menu"),
  },
  {
    href: "/settings",
    label: "Personal",
    description: "Usuarios y permisos",
    icon: Settings,
    match: (path) => path === "/settings",
  },
  {
    href: "/settings/negocios",
    label: "Negocios",
    description: "Locales y cuentas de dueños",
    icon: Building2,
    match: (path) => path.startsWith("/settings/negocios"),
  },
  {
    href: "/settings/mesas",
    label: "Mesas",
    description: "Zonas y distribución",
    icon: LayoutGrid,
    match: (path) => path.startsWith("/settings/mesas"),
  },
];

const CONTROL_ITEMS: NavItem[] = [
  {
    href: "/settings/inventario",
    label: "Inventario",
    description: "Insumos, recetas y conteos",
    icon: Boxes,
    match: (path) => path.startsWith("/settings/inventario"),
  },
  {
    href: "/settings/caja",
    label: "Caja",
    description: "Turnos, cortes y ajustes",
    icon: Landmark,
    match: (path) => path.startsWith("/settings/caja"),
  },
  {
    href: "/settings/impresion",
    label: "Impresión",
    description: "Estación de tickets",
    icon: Printer,
    match: (path) => path.startsWith("/settings/impresion"),
  },
  {
    href: "/settings/diagnostico",
    label: "Diagnóstico",
    description: "Conexiones y salud del sistema",
    icon: Stethoscope,
    match: (path) => path.startsWith("/settings/diagnostico"),
  },
];

function getSurfaceLabel(pathname: string) {
  if (pathname === "/dashboard/mesero") return "Mesero";
  if (pathname === "/dashboard/cocina") return "Cocina";
  if (pathname === "/dashboard/whatsapp") return "WhatsApp";
  if (pathname === "/dashboard/analiticas") return "Analíticas";
  if (pathname.startsWith("/menu")) return "Menú";
  if (pathname.startsWith("/settings/negocios")) return "Negocios";
  if (pathname.startsWith("/settings/mesas")) return "Mesas";
  if (pathname.startsWith("/settings/inventario")) return "Inventario";
  if (pathname.startsWith("/settings/caja")) return "Caja";
  if (pathname.startsWith("/settings/impresion")) return "Impresión";
  if (pathname.startsWith("/settings/diagnostico")) return "Diagnóstico";
  if (pathname === "/settings") return "Personal";
  return "Operación";
}

function isGroupActive(items: NavItem[], pathname: string) {
  return items.some((item) => item.match(pathname));
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex h-12 items-center gap-3 rounded-xl px-3 font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
        active
          ? "bg-brand text-white shadow-md shadow-brand/25"
          : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon aria-hidden size={20} strokeWidth={2.25} className="shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarGroup({
  label,
  icon: GroupIcon,
  items,
  pathname,
}: {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  pathname: string;
}) {
  const active = isGroupActive(items, pathname);

  return (
    <Collapsible.Root
      key={active ? "active" : "inactive"}
      defaultOpen={active}
      className="mt-1"
    >
      <Collapsible.Trigger
        className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 font-heading text-sm font-semibold transition-colors ${
          active
            ? "bg-brand-light text-brand"
            : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
        }`}
      >
        <GroupIcon aria-hidden size={19} className="shrink-0" />
        <span>{label}</span>
        <ChevronDown
          aria-hidden
          size={16}
          className="ml-auto transition-transform group-data-panel-open:rotate-180"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-150 data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
        <div className="mt-1 space-y-1 pl-3">
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function HeaderLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        active
          ? "bg-brand text-white shadow-md shadow-brand/20"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      <Icon aria-hidden size={17} strokeWidth={2.25} />
      <span>{item.label}</span>
    </Link>
  );
}

function HeaderGroup({
  label,
  icon: GroupIcon,
  items,
  pathname,
}: {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  pathname: string;
}) {
  const active = isGroupActive(items, pathname);

  return (
    <Menu.Root>
      <Menu.Trigger
        className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          active
            ? "bg-brand-light text-brand"
            : "text-muted-foreground hover:bg-surface-raised hover:text-foreground data-popup-open:bg-surface-raised data-popup-open:text-foreground"
        }`}
      >
        <GroupIcon aria-hidden size={17} />
        <span>{label}</span>
        <ChevronDown aria-hidden size={14} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[110] outline-none" sideOffset={8} align="start">
          <Menu.Popup className="w-64 origin-[var(--transform-origin)] rounded-2xl border border-border bg-surface p-1.5 text-foreground shadow-float outline-none transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            {items.map((item) => {
              const activeItem = item.match(pathname);
              const Icon = item.icon;
              return (
                <Menu.LinkItem
                  key={item.href}
                  render={<Link href={item.href} />}
                  closeOnClick
                  aria-current={activeItem ? "page" : undefined}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 outline-none transition-colors data-highlighted:bg-surface-raised ${
                    activeItem ? "bg-brand-light text-brand" : "text-foreground"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${activeItem ? "bg-brand/15" : "bg-background"}`}>
                    <Icon aria-hidden size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading text-sm font-bold">{item.label}</span>
                    <span className={`block truncate font-body text-xs ${activeItem ? "text-brand/75" : "text-muted-foreground"}`}>
                      {item.description}
                    </span>
                  </span>
                </Menu.LinkItem>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function BusinessSelector({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const businesses = useBusinessContextStore((state) => state.businesses);
  const selectedBusinessId = useBusinessContextStore(
    (state) => state.selectedBusinessId
  );
  const ensureLoaded = useBusinessContextStore((state) => state.ensureLoaded);
  const selectBusiness = useBusinessContextStore((state) => state.selectBusiness);
  const hasActiveComanda = useCartStore((state) => state.items.length > 0);
  const activeBusinesses = getSelectableBusinessContexts(
    businesses.filter(
      (business) => business.business_lifecycle_status === "active"
    )
  );

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  // Mesero already has an explicit menu selector for mixed-business orders.
  // Hiding the global context selector here avoids two competing selectors
  // and keeps the primary navigation clear on tablets.
  if (pathname === "/dashboard/mesero") return null;

  if (
    activeBusinesses.length <= 1 ||
    !selectedBusinessId ||
    (pathname === "/dashboard/mesero" && hasActiveComanda)
  ) {
    return null;
  }

  return (
    <label
      className={`flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-2.5 ${
        compact ? "h-10" : "h-11"
      }`}
    >
      <Building2
        aria-hidden
        size={compact ? 16 : 17}
        className="shrink-0 text-brand"
      />
      <span className="sr-only">Negocio activo</span>
      <select
        aria-label="Negocio activo"
        value={selectedBusinessId}
        onChange={(event) => {
          if (selectBusiness(event.target.value)) router.refresh();
        }}
        className={`min-w-0 max-w-40 bg-transparent font-heading font-bold text-foreground outline-none ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {activeBusinesses.map((business) => (
          <option key={business.business_id} value={business.business_id}>
            {business.business_display_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function WorkspaceBrand({
  href = "/dashboard",
  business,
  className,
}: {
  href?: string;
  business: BusinessContextRow | null;
  className: string;
}) {
  const name = business?.business_display_name ?? "Rincón 404";
  const logoUrl = getBusinessLogoUrl(business?.business_brand_logo_path);
  return (
    <Link href={href} aria-label={`${name}, inicio`} className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-9 shrink-0 rounded-md bg-white/5 object-contain p-0.5" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground">
          <Building2 size={16} aria-hidden />
        </span>
      )}
      <span className="max-w-36 truncate font-heading font-extrabold tracking-[-0.025em] text-foreground">
        {name}
      </span>
    </Link>
  );
}

function MobileLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = item.match(pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`mideli-touch-target flex min-h-16 min-w-[4.5rem] flex-1 shrink-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 py-2 font-heading text-[10px] font-semibold focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${
        active ? "text-brand" : "text-muted-foreground"
      }`}
    >
      <span
        className={`flex h-8 w-12 items-center justify-center rounded-xl transition-colors ${
          active ? "bg-brand-light" : ""
        }`}
      >
        <Icon aria-hidden size={20} strokeWidth={active ? 2.5 : 2} />
      </span>
      {item.label}
    </Link>
  );
}

function MobileMoreDrawer({
  pathname,
  adminItems,
  controlItems,
}: {
  pathname: string;
  adminItems: NavItem[];
  controlItems: NavItem[];
}) {
  const active = isGroupActive([...adminItems, ...controlItems], pathname);
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="down">
      <Drawer.Trigger
        className={`flex min-h-16 min-w-[4.5rem] flex-1 shrink-0 touch-manipulation flex-col items-center justify-center gap-0.5 py-2 font-heading text-[10px] font-semibold focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${
          active ? "text-brand" : "text-muted-foreground"
        }`}
      >
        <span
          className={`flex h-8 w-12 items-center justify-center rounded-full ${
            active ? "bg-brand-light" : ""
          }`}
        >
          <MoreHorizontal aria-hidden size={20} strokeWidth={active ? 2.5 : 2} />
        </span>
        Más
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-[100] min-h-dvh bg-ink/75 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-[101] flex items-end">
          <Drawer.Popup className="max-h-[86dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-foreground shadow-float outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-300 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:select-none data-swiping:duration-0">
            <Drawer.Content className="mx-auto w-full max-w-lg">
              <div className="mb-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Drawer.Title className="font-heading text-lg font-bold">
                    Herramientas del local
                  </Drawer.Title>
                  <Drawer.Description className="mt-1 font-body text-sm text-muted-foreground">
                    Administración y control en un solo lugar.
                  </Drawer.Description>
                </div>
                <Drawer.Close
                  aria-label="Cerrar herramientas"
                  className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  <X aria-hidden size={18} />
                </Drawer.Close>
              </div>

              {[
                { label: "Administrar", items: adminItems },
                { label: "Control", items: controlItems },
              ]
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <section key={group.label} className="mb-5 last:mb-0">
                    <h2 className="mb-2 font-heading text-sm font-bold text-muted-foreground">
                      {group.label}
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const itemActive = item.match(pathname);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            aria-current={itemActive ? "page" : undefined}
                            className={`flex min-h-20 items-center gap-3 rounded-xl px-3 transition-colors ${
                              itemActive
                                ? "bg-brand text-white"
                                : "bg-background text-foreground hover:bg-surface-raised"
                            }`}
                          >
                            <Icon aria-hidden size={20} className="shrink-0" />
                            <span className="min-w-0">
                              <span className="block font-heading text-sm font-bold">
                                {item.label}
                              </span>
                              <span className={`mt-0.5 block font-body text-[11px] leading-tight ${itemActive ? "text-white/75" : "text-muted-foreground"}`}>
                                {item.description}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  userId: string;
  userRole: Profile["role"];
  capabilities?: string[];
  multibusinessContextAvailable?: boolean;
  whatsappAccess?: boolean;
}

export function DashboardShell({
  children,
  userName,
  userId,
  userRole,
  capabilities = [],
  multibusinessContextAvailable = false,
  whatsappAccess = false,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const refreshBusinessContext = useBusinessContextStore((state) => state.ensureLoaded);
  const businessContexts = useBusinessContextStore((state) => state.businesses);
  const localBusinessBrand = resolveBusinessBrandingContext(businessContexts);
  const isKitchenFocus = pathname === "/dashboard/cocina";
  const surfaceLabel = getSurfaceLabel(pathname);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const hasCapability = (capability: string) => capabilities.includes(capability);

  useEffect(() => {
    void refreshBusinessContext(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshBusinessContext(true);
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [refreshBusinessContext]);
  const canUsePos =
    (!multibusinessContextAvailable && isAdmin) ||
    (!multibusinessContextAvailable &&
      (userRole === "waiter" || userRole === "supervisor")) ||
    hasCapability("business.operate_orders") ||
    hasCapability("organization.operate_orders");
  const canUseKitchen =
    (!multibusinessContextAvailable && isAdmin) ||
    (!multibusinessContextAvailable &&
      (userRole === "kitchen" || userRole === "supervisor")) ||
    hasCapability("business.update_preparation");
  const canUseWhatsapp =
    (!multibusinessContextAvailable && isAdmin) ||
    (multibusinessContextAvailable
      ? whatsappAccess
      : userRole === "waiter" || userRole === "supervisor");
  const canUseAnalytics =
    (!multibusinessContextAvailable && isAdmin) ||
    (multibusinessContextAvailable &&
      isAdmin &&
      (hasCapability("business.operate_orders") ||
        hasCapability("business.charge_orders") ||
        hasCapability("business.manage_cash") ||
        hasCapability("organization.charge_orders")));
  const adminItems = ADMIN_ITEMS.filter((item) => {
    if (item.href === "/menu") {
      return (
        (!multibusinessContextAvailable && isAdmin) ||
        hasCapability("business.manage_catalog")
      );
    }
    if (item.href === "/settings") {
      return (
        (!multibusinessContextAvailable && isAdmin) ||
        hasCapability("business.manage_staff") ||
        hasCapability("organization.manage_global_waiters")
      );
    }
    if (item.href === "/settings/negocios") {
      return hasCapability("platform.manage_businesses");
    }
    return (
      (!multibusinessContextAvailable && isAdmin) ||
      hasCapability("organization.manage_tables")
    );
  });
  const controlItems = CONTROL_ITEMS.filter((item) => {
    if (item.href === "/settings/inventario") {
      return (
        (!multibusinessContextAvailable && isAdmin) ||
        hasCapability("business.manage_inventory")
      );
    }
    if (item.href === "/settings/caja") {
      return (
        (!multibusinessContextAvailable && isAdmin) ||
        hasCapability("business.manage_cash")
      );
    }
    if (item.href === "/settings/impresion") {
      return (
        (!multibusinessContextAvailable && isAdmin) ||
        hasCapability("business.manage_catalog")
      );
    }
    if (item.href === "/settings/diagnostico") {
      return (
        (!multibusinessContextAvailable && isAdmin) ||
        (isAdmin &&
          (hasCapability("business.manage_catalog") ||
            hasCapability("business.manage_cash") ||
            hasCapability("platform.manage_businesses")))
      );
    }
    return false;
  });
  const operationItems: NavItem[] = [
    ...(canUsePos ? [POS_ITEM] : []),
    ...(canUseKitchen ? [KITCHEN_ITEM] : []),
    ...(canUseWhatsapp ? [WHATSAPP_ITEM] : []),
    ...(canUseAnalytics ? [ANALYTICS_ITEM] : []),
  ];
  const operationHrefs = operationItems.map((item) => item.href).join("|");

  useEffect(() => {
    const hrefs = operationHrefs.split("|").filter(Boolean);
    const prefetchTimer = window.setTimeout(() => {
      hrefs.forEach((href) => router.prefetch(href));
    }, 250);

    return () => window.clearTimeout(prefetchTimer);
  }, [operationHrefs, router]);

  function startTour() {
    window.dispatchEvent(new CustomEvent("mideli:start-tour"));
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      className={`mideli-dashboard-shell flex h-[100dvh] flex-col bg-background ${isKitchenFocus ? "" : "xl:flex-row"}`}
    >
      <aside
        className={
          isKitchenFocus
            ? "hidden"
            : "hidden w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground xl:flex"
        }
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <WorkspaceBrand business={localBusinessBrand} className="text-base" />
          <div className="ml-auto">
            <BusinessSelector compact />
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Vistas">
          {operationItems.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
          {adminItems.length > 0 || controlItems.length > 0 ? (
            <>
              {adminItems.length > 0 ? (
                <SidebarGroup
                  label="Administrar"
                  icon={SlidersHorizontal}
                  items={adminItems}
                  pathname={pathname}
                />
              ) : null}
              {controlItems.length > 0 ? (
                <SidebarGroup
                  label="Control"
                  icon={Landmark}
                  items={controlItems}
                  pathname={pathname}
                />
              ) : null}
            </>
          ) : null}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <div className="mb-2 truncate px-3 font-body text-xs text-sidebar-foreground/50">
            {userName}
          </div>
          <button
            type="button"
            onClick={startTour}
            className="mb-1 flex h-11 w-full items-center gap-2 rounded-xl px-3 text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <HelpCircle aria-hidden size={18} />
            <span className="font-heading text-sm font-semibold">Ayuda y tutorial</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut aria-hidden size={18} />
            <span className="font-heading text-sm font-semibold">Salir</span>
          </button>
        </div>
      </aside>

      <header
        className={
          isKitchenFocus
            ? "hidden"
            : "mideli-dashboard-responsive-header hidden h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 shadow-sm sm:px-4 md:flex xl:hidden"
        }
      >
        <WorkspaceBrand business={localBusinessBrand} className="mr-1 shrink-0 text-sm" />
        <BusinessSelector compact />
        <nav className="pos-scroll flex min-w-0 flex-1 touch-pan-x items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain" aria-label="Navegación principal">
          {operationItems.map((item) => (
            <HeaderLink key={item.href} item={item} pathname={pathname} />
          ))}
          {adminItems.length > 0 || controlItems.length > 0 ? (
            <>
              {adminItems.length > 0 ? (
                <HeaderGroup
                  label="Administrar"
                  icon={SlidersHorizontal}
                  items={adminItems}
                  pathname={pathname}
                />
              ) : null}
              {controlItems.length > 0 ? (
                <HeaderGroup
                  label="Control"
                  icon={Landmark}
                  items={controlItems}
                  pathname={pathname}
                />
              ) : null}
            </>
          ) : null}
        </nav>
        <button
          type="button"
          onClick={startTour}
          aria-label="Abrir ayuda y tutorial"
          className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <HelpCircle aria-hidden size={17} />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          title={userName || "Cerrar sesión"}
          className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <LogOut aria-hidden size={17} />
        </button>
      </header>

      <header
        className={
          isKitchenFocus
            ? "hidden"
            : "mideli-dashboard-responsive-header mideli-context-bar flex h-14 shrink-0 items-center border-b border-border px-4 shadow-sm md:hidden"
        }
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <WorkspaceBrand business={localBusinessBrand} className="shrink-0 text-sm" />
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <span className="truncate font-heading text-xs font-bold text-foreground">
            {surfaceLabel}
          </span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <BusinessSelector compact />
          <span className="hidden max-w-28 truncate text-xs text-muted-foreground sm:inline">
            {userName}
          </span>
          <button
            type="button"
            onClick={startTour}
            aria-label="Abrir ayuda y tutorial"
            className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <HelpCircle aria-hidden size={17} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title={userName || "Cerrar sesión"}
            className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <LogOut aria-hidden size={17} />
          </button>
        </div>
      </header>

      {isKitchenFocus ? (
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-surface px-3 shadow-sm sm:px-5">
          <WorkspaceBrand href="/dashboard/cocina" business={localBusinessBrand} className="text-sm" />
          <div className="flex items-center gap-2">
            <BusinessSelector compact />
            <span className="hidden font-body text-[11px] text-muted-foreground sm:inline">
              Modo cocina
            </span>
            <button
              type="button"
              onClick={startTour}
              aria-label="Abrir ayuda y tutorial"
              title="Ayuda y tutorial"
              className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <HelpCircle aria-hidden size={15} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <LogOut aria-hidden size={15} />
            </button>
          </div>
        </header>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="mideli-dashboard-main min-h-0 flex-1 overflow-hidden">
          <DashboardUserProvider value={userId}>{children}</DashboardUserProvider>
        </main>

        <nav
          className={
            isKitchenFocus
              ? "hidden"
              : "mideli-mobile-bottom-nav flex min-h-16 shrink-0 touch-manipulation select-none items-stretch overflow-clip overscroll-none border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          }
          aria-label="Navegación"
        >
          {operationItems.map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
          {adminItems.length > 0 || controlItems.length > 0 ? (
            <MobileMoreDrawer
              pathname={pathname}
              adminItems={adminItems}
              controlItems={controlItems}
            />
          ) : null}
        </nav>
      </div>
      <RoleOnboardingTour role={userRole} />
    </div>
  );
}
