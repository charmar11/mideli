"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { Drawer } from "@base-ui/react/drawer";
import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  ChefHat,
  ChevronDown,
  ClipboardList,
  HelpCircle,
  Landmark,
  LayoutGrid,
  LogOut,
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
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

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
      className={`flex h-12 items-center gap-3 rounded-xl px-3 font-heading text-sm font-semibold transition-colors ${
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
      className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold transition-colors ${
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
      className={`flex min-w-[4.5rem] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 py-2 font-heading text-[10px] font-semibold ${
        active ? "text-brand" : "text-muted-foreground"
      }`}
    >
      <span
        className={`flex h-8 w-12 items-center justify-center rounded-full ${
          active ? "bg-brand-light" : ""
        }`}
      >
        <Icon aria-hidden size={20} strokeWidth={active ? 2.5 : 2} />
      </span>
      {item.label}
    </Link>
  );
}

function MobileMoreDrawer({ pathname }: { pathname: string }) {
  const active = isGroupActive([...ADMIN_ITEMS, ...CONTROL_ITEMS], pathname);
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="down">
      <Drawer.Trigger
        className={`flex min-w-[4.5rem] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 py-2 font-heading text-[10px] font-semibold ${
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
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                >
                  <X aria-hidden size={18} />
                </Drawer.Close>
              </div>

              {[
                { label: "Administrar", items: ADMIN_ITEMS },
                { label: "Control", items: CONTROL_ITEMS },
              ].map((group) => (
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
  userRole: Profile["role"];
}

export function DashboardShell({
  children,
  userName,
  userRole,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isKitchenFocus = pathname === "/dashboard/cocina";
  const isAdmin = userRole === "owner" || userRole === "admin";
  const canUsePos = isAdmin || userRole === "waiter" || userRole === "supervisor";
  const canUseKitchen =
    isAdmin || userRole === "kitchen" || userRole === "supervisor";

  const operationItems: NavItem[] = [
    ...(canUsePos ? [POS_ITEM] : []),
    ...(canUseKitchen ? [KITCHEN_ITEM] : []),
    ...(isAdmin ? [ANALYTICS_ITEM] : []),
  ];

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
      className={`flex h-dvh flex-col bg-background ${isKitchenFocus ? "" : "xl:flex-row"}`}
    >
      <aside
        className={
          isKitchenFocus
            ? "hidden"
            : "hidden w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground xl:flex"
        }
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="font-brand text-[1.75rem] text-brand">
            Mideli
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Vistas">
          {operationItems.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
          {isAdmin ? (
            <>
              <SidebarGroup
                label="Administrar"
                icon={SlidersHorizontal}
                items={ADMIN_ITEMS}
                pathname={pathname}
              />
              <SidebarGroup
                label="Control"
                icon={Landmark}
                items={CONTROL_ITEMS}
                pathname={pathname}
              />
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
            : "hidden h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 shadow-sm sm:px-4 md:flex xl:hidden"
        }
      >
        <Link href="/dashboard" className="mr-1 shrink-0 font-brand text-2xl text-brand">
          Mideli
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Navegación principal">
          {operationItems.map((item) => (
            <HeaderLink key={item.href} item={item} pathname={pathname} />
          ))}
          {isAdmin ? (
            <>
              <HeaderGroup
                label="Administrar"
                icon={SlidersHorizontal}
                items={ADMIN_ITEMS}
                pathname={pathname}
              />
              <HeaderGroup
                label="Control"
                icon={Landmark}
                items={CONTROL_ITEMS}
                pathname={pathname}
              />
            </>
          ) : null}
        </nav>
        <button
          type="button"
          onClick={startTour}
          aria-label="Abrir ayuda y tutorial"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <HelpCircle aria-hidden size={17} />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          title={userName || "Cerrar sesión"}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <LogOut aria-hidden size={17} />
        </button>
      </header>

      <header
        className={
          isKitchenFocus
            ? "hidden"
            : "flex h-14 shrink-0 items-center border-b border-border bg-surface px-4 shadow-sm md:hidden"
        }
      >
        <Link href="/dashboard" className="shrink-0 font-brand text-2xl text-brand">
          Mideli
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span className="max-w-28 truncate text-xs text-muted-foreground">
            {userName}
          </span>
          <button
            type="button"
            onClick={startTour}
            aria-label="Abrir ayuda y tutorial"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <HelpCircle aria-hidden size={17} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title={userName || "Cerrar sesión"}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <LogOut aria-hidden size={17} />
          </button>
        </div>
      </header>

      {isKitchenFocus ? (
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-surface px-3 shadow-sm sm:px-5">
          <Link href="/dashboard/cocina" className="font-brand text-xl text-brand">
            Mideli
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden font-body text-[11px] text-muted-foreground sm:inline">
              Modo cocina
            </span>
            <button
              type="button"
              onClick={startTour}
              aria-label="Abrir ayuda y tutorial"
              title="Ayuda y tutorial"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <HelpCircle aria-hidden size={15} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <LogOut aria-hidden size={15} />
            </button>
          </div>
        </header>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

        <nav
          className={
            isKitchenFocus
              ? "hidden"
              : "flex shrink-0 items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          }
          aria-label="Navegación"
        >
          {operationItems.map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
          {isAdmin ? <MobileMoreDrawer pathname={pathname} /> : null}
        </nav>
      </div>
      <RoleOnboardingTour role={userRole} />
    </div>
  );
}
