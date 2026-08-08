"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  LayoutGrid,
  Landmark,
  HelpCircle,
  LogOut,
  Printer,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { RoleOnboardingTour } from "@/components/onboarding/role-onboarding-tour";

const NAV = [
  {
    href: "/dashboard/mesero",
    label: "Mesero",
    icon: UtensilsCrossed,
    match: (path: string) => path === "/dashboard/mesero",
  },
  {
    href: "/dashboard/cocina",
    label: "Cocina",
    icon: ChefHat,
    match: (path: string) => path === "/dashboard/cocina",
  },
  {
    href: "/dashboard/analiticas",
    label: "Analíticas",
    icon: BarChart3,
    match: (path: string) => path === "/dashboard/analiticas",
  },
] as const;

const ADMIN_NAV = [
  {
    href: "/menu",
    label: "Menú",
    icon: ClipboardList,
    match: (path: string) => path.startsWith("/menu"),
  },
  {
    href: "/settings",
    label: "Personal",
    icon: Settings,
    match: (path: string) => path === "/settings",
  },
  {
    href: "/settings/mesas",
    label: "Mesas",
    icon: LayoutGrid,
    match: (path: string) => path.startsWith("/settings/mesas"),
  },
  {
    href: "/settings/inventario",
    label: "Inventario",
    icon: Boxes,
    match: (path: string) => path.startsWith("/settings/inventario"),
  },
  {
    href: "/settings/caja",
    label: "Caja",
    icon: Landmark,
    match: (path: string) => path.startsWith("/settings/caja"),
  },
  {
    href: "/settings/impresion",
    label: "Impresión",
    icon: Printer,
    match: (path: string) => path.startsWith("/settings/impresion"),
  },
] as const;

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
  const canUseInventory = isAdmin;

  function startTour() {
    window.dispatchEvent(new CustomEvent("mideli:start-tour"));
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = [
    ...(canUsePos ? [NAV[0]] : []),
    ...(canUseKitchen ? [NAV[1]] : []),
    ...(canUseInventory ? [ADMIN_NAV[3]] : []),
    ...(isAdmin ? [NAV[2]] : []),
    ...(isAdmin
      ? [ADMIN_NAV[0], ADMIN_NAV[1], ADMIN_NAV[2], ADMIN_NAV[4], ADMIN_NAV[5]]
      : []),
  ];

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
        <div className="flex h-16 items-center justify-start border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="font-brand text-[1.75rem] text-brand">
            Mideli
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Vistas">
          {items.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`flex h-12 items-center justify-start gap-3 rounded-xl px-3 font-heading text-sm font-semibold transition-colors ${
                  active
                    ? "bg-brand text-white shadow-md shadow-brand/30"
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={20} strokeWidth={2.25} className="shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <div className="mb-2 truncate px-3 font-body text-xs text-sidebar-foreground/50">
            {userName}
          </div>
          <button
            type="button"
            onClick={startTour}
            className="mb-1 flex h-11 w-full items-center justify-start gap-2 rounded-xl px-3 text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <HelpCircle size={18} />
            <span className="font-heading text-sm font-semibold">Ayuda y tutorial</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-11 w-full items-center justify-start gap-2 rounded-xl px-3 text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            <span className="font-heading text-sm font-semibold">Salir</span>
          </button>
        </div>
      </aside>

      <header
        className={
          isKitchenFocus
            ? "hidden"
            : "hidden h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 shadow-sm sm:px-4 md:flex xl:hidden"
        }
      >
        <Link href="/dashboard" className="shrink-0 font-brand text-2xl text-brand">
          Mideli
        </Link>
        <nav
          className="pos-scroll min-w-0 flex-1 overflow-x-auto"
          aria-label="Navegación principal"
        >
          <div className="flex min-w-max items-center gap-1">
            {items.map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold transition-colors ${
                    active
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  <Icon size={17} strokeWidth={2.25} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <button
          type="button"
          onClick={startTour}
          aria-label="Abrir ayuda y tutorial"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <HelpCircle size={17} />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          title={userName || "Cerrar sesión"}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <LogOut size={17} />
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
            <HelpCircle size={17} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title={userName || "Cerrar sesión"}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
          >
            <LogOut size={17} />
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
              <HelpCircle size={15} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <LogOut size={15} />
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
              : "pos-scroll flex shrink-0 items-stretch overflow-x-auto border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          }
          aria-label="Navegación"
        >
          {items.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-[4.5rem] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 py-2 font-heading text-[10px] font-semibold ${
                  active ? "text-brand" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full ${
                    active ? "bg-brand-light" : ""
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <RoleOnboardingTour role={userRole} />
    </div>
  );
}
