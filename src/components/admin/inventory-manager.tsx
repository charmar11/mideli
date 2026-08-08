"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  LayoutDashboard,
  Loader2,
  Package,
  Plus,
  CircleHelp,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCatalogStore, useInventoryStore } from "@/lib/stores";
import type { Profile } from "@/types/database";
import { InventoryCountPanel } from "./inventory/inventory-count-panel";
import { InventoryDashboard } from "./inventory/inventory-dashboard";
import { InventoryItemsPanel } from "./inventory/inventory-items-panel";
import { InventoryMovementsPanel } from "./inventory/inventory-movements-panel";
import { InventoryPurchasePanel } from "./inventory/inventory-purchase-panel";
import { InventoryReceivePanel } from "./inventory/inventory-receive-panel";
import { RecipeLibrary } from "./inventory/recipe-library";
import { InventoryOnboardingTour } from "@/components/onboarding/inventory-onboarding-tour";

export type InventoryView =
  | "overview"
  | "items"
  | "recipes"
  | "purchase"
  | "count"
  | "movements";

const NAV_ITEMS = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "items", label: "Insumos", icon: Package },
  { id: "recipes", label: "Recetas", icon: BookOpen },
  { id: "purchase", label: "Comprar", icon: ShoppingCart },
  { id: "count", label: "Contar", icon: ClipboardCheck },
  { id: "movements", label: "Movimientos", icon: ArrowDownUp },
] as const;

export function InventoryManager() {
  const {
    items,
    recipes,
    movements,
    counts,
    countLines,
    purchaseOrders,
    purchaseOrderLines,
    lots,
    loading,
    lastError,
    fetchInventory,
  } = useInventoryStore();
  const { categories, menuItems, fetchCatalog } = useCatalogStore();
  const [view, setView] = useState<InventoryView>("overview");
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [newItemSignal, setNewItemSignal] = useState(0);
  const [role, setRole] = useState<Profile["role"] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tourRestartSignal, setTourRestartSignal] = useState(0);

  useEffect(() => {
    void Promise.all([fetchInventory(), fetchCatalog()]);
    const supabase = createClient();
    async function loadRole() {
      const userResult = await supabase.auth.getUser();
      if (!userResult.data.user) return;
      setUserId(userResult.data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userResult.data.user.id)
        .maybeSingle();
      if (profile?.role) setRole(profile.role as Profile["role"]);
    }
    void loadRole();
  }, [fetchCatalog, fetchInventory]);

  const isAdmin = role === "owner" || role === "admin";
  const badges = useMemo(() => {
    const critical = items.filter(
      (item) => item.is_active && item.current_stock <= item.minimum_stock
    ).length;
    const pendingPurchases = purchaseOrders.filter(
      (order) => order.status === "ordered" || order.status === "partially_received"
    ).length;
    const pendingCounts = counts.filter(
      (count) => count.status === "draft" || count.status === "submitted"
    ).length;
    return { overview: critical, count: pendingCounts, purchase: pendingPurchases };
  }, [counts, items, purchaseOrders]);

  function handleReceive(purchaseOrderId: string | null) {
    setSelectedPurchaseOrderId(purchaseOrderId);
    setReceiving(true);
    setView("purchase");
  }

  function handleNewItem() {
    setNewItemSignal((current) => current + 1);
    setView("items");
  }

  const handleViewChange = useCallback((nextView: InventoryView) => {
    setReceiving(false);
    setNewItemSignal(0);
    setView(nextView);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 shadow-sm sm:h-16 sm:px-5">
        <Link href="/dashboard" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground" aria-label="Volver al dashboard">
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-base font-bold text-foreground sm:text-lg">Inventario</h1>
          <p className="truncate font-body text-[11px] text-muted-foreground sm:text-xs">
            {role === "kitchen" ? "Consulta operativa" : role === "supervisor" ? "Control del turno" : "Existencias, compras y costos"}
          </p>
        </div>
        <button type="button" onClick={() => setTourRestartSignal((current) => current + 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand" aria-label="Abrir guía de inventario" title="Ayuda de inventario">
          <CircleHelp size={17} />
        </button>
        <button type="button" disabled={loading} onClick={() => void fetchInventory()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-40" aria-label="Actualizar inventario">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        {isAdmin ? (
          <button data-tour="inventory-new-item-header" type="button" onClick={handleNewItem} className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-xl bg-brand font-heading text-xs font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover sm:w-auto sm:px-4" aria-label="Nuevo insumo">
            <Plus size={16} /> <span className="hidden sm:inline">Nuevo insumo</span>
          </button>
        ) : null}
      </header>

      <nav data-tour="inventory-navigation" className="shrink-0 border-b border-border bg-surface/95 px-2 py-1.5 sm:px-4" aria-label="Secciones de inventario">
        <div className="mx-auto flex max-w-6xl items-stretch gap-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            const badge = id === "overview" ? badges.overview : id === "count" ? badges.count : id === "purchase" ? badges.purchase : 0;
            return (
              <button key={id} type="button" data-tour={`inventory-nav-${id}`} aria-pressed={active} onClick={() => handleViewChange(id)} className={`relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl font-heading text-[10px] font-bold transition-colors sm:h-10 sm:flex-row sm:gap-2 sm:text-xs ${active ? "bg-brand text-white shadow-sm shadow-brand/20" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}>
                <Icon size={16} />
                <span className="max-w-full truncate">{label}</span>
                {badge > 0 ? <span className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-data text-[10px] font-bold sm:static ${active ? "bg-white/20 text-white" : "bg-warning-light text-warning"}`}>{badge > 99 ? "99+" : badge}</span> : null}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="pos-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-3 pb-24 sm:p-5 sm:pb-8">
          {lastError ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3">
              <p className="font-body text-xs text-destructive">{lastError}</p>
              <button type="button" onClick={() => void fetchInventory()} className="shrink-0 font-heading text-xs font-bold text-destructive underline">Reintentar</button>
            </div>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 size={18} className="animate-spin" /><span className="font-body text-sm">Preparando inventario</span></div>
          ) : view === "overview" ? (
            <div data-tour="inventory-view-overview">
              <InventoryDashboard items={items} lots={lots} counts={counts} purchaseOrders={purchaseOrders} movements={movements} isAdmin={isAdmin} onNavigate={setView} onCreateItem={handleNewItem} />
            </div>
          ) : view === "items" ? (
            <div data-tour="inventory-view-items">
              <InventoryItemsPanel key={`items-${newItemSignal}`} items={items} isAdmin={isAdmin} initialEditorOpen={newItemSignal > 0} />
            </div>
          ) : view === "recipes" ? (
            <div data-tour="inventory-view-recipes">
              <RecipeLibrary menuItems={menuItems} categories={categories} items={items} recipes={recipes} isAdmin={isAdmin} />
            </div>
          ) : view === "count" ? (
            <div data-tour="inventory-view-count">
              <InventoryCountPanel key={counts.find((count) => count.status === "draft")?.id ?? "new-count"} items={items} counts={counts} countLines={countLines} isAdmin={isAdmin} />
            </div>
          ) : view === "purchase" ? (
            <div data-tour="inventory-view-purchase">
              {receiving ? (
                <InventoryReceivePanel key={selectedPurchaseOrderId ?? "manual-receipt"} items={items} purchaseOrders={purchaseOrders} purchaseOrderLines={purchaseOrderLines} selectedPurchaseOrderId={selectedPurchaseOrderId} onSelectedPurchaseOrderChange={setSelectedPurchaseOrderId} onBack={() => setReceiving(false)} />
              ) : (
                <InventoryPurchasePanel items={items} purchaseOrders={purchaseOrders} purchaseOrderLines={purchaseOrderLines} onReceive={(id) => handleReceive(id)} onDirectReceive={() => handleReceive(null)} />
              )}
            </div>
          ) : (
            <div data-tour="inventory-view-movements">
              <InventoryMovementsPanel items={items} lots={lots} movements={movements} isAdmin={isAdmin} />
            </div>
          )}
        </div>
      </main>

      <InventoryOnboardingTour userId={userId} view={view} restartSignal={tourRestartSignal} onViewChange={handleViewChange} />

    </div>
  );
}
