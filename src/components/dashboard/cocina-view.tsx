"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useOrderStore, useCatalogStore } from "@/lib/stores";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Clock,
  Flame,
  Maximize2,
  Minimize2,
  RefreshCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { OrderItem } from "@/types/database";
import type { OrderWithItems } from "@/lib/stores/order-store";

const NEW_ORDER_SOUND_SRC = "/sounds/akshai26-notification-for-orders-313025.mp3";

const TYPE_LABELS: Record<string, string> = {
  comedor: "Comedor",
  domicilio: "Domicilio",
  para_llevar: "Para llevar",
};

function getMinutesElapsed(dateString: string, now = Date.now()): number {
  return Math.floor((now - new Date(dateString).getTime()) / 60000);
}

function formatElapsed(dateString: string, now = Date.now()): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(dateString).getTime()) / 1000)
  );
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getUrgencyLevel(minutes: number): "normal" | "warning" | "critical" {
  if (minutes >= 15) return "critical";
  if (minutes >= 10) return "warning";
  return "normal";
}

type KitchenFilter = "pending" | "new" | "in_kitchen" | "ready" | "urgent";

interface KitchenItemChange {
  key: string;
  name: string;
  quantity: number;
  fromQuantity?: number;
  toQuantity?: number;
}

interface KitchenOrderUpdate {
  added: KitchenItemChange[];
  removed: KitchenItemChange[];
  changed: KitchenItemChange[];
  infoChanged: boolean;
}

function getItemKey(item: OrderItem): string {
  return `${item.menu_item_id}|${JSON.stringify(item.selected_modifiers ?? [])}|${item.notes ?? ""}`;
}

function groupItems(items: OrderItem[]) {
  const grouped = new Map<string, { item: OrderItem; quantity: number }>();
  for (const item of items) {
    const key = getItemKey(item);
    const current = grouped.get(key);
    grouped.set(key, {
      item: current?.item ?? item,
      quantity: (current?.quantity ?? 0) + item.quantity,
    });
  }
  return grouped;
}

function getOrderUpdate(
  previous: OrderWithItems,
  current: OrderWithItems,
  getItemName: (menuItemId: string) => string
): KitchenOrderUpdate | null {
  const previousItems = groupItems(previous.items);
  const currentItems = groupItems(current.items);
  const added: KitchenItemChange[] = [];
  const removed: KitchenItemChange[] = [];
  const changed: KitchenItemChange[] = [];

  for (const [key, currentItem] of currentItems) {
    const previousItem = previousItems.get(key);
    if (!previousItem) {
      added.push({
        key,
        name: getItemName(currentItem.item.menu_item_id),
        quantity: currentItem.quantity,
      });
    } else if (previousItem.quantity !== currentItem.quantity) {
      changed.push({
        key,
        name: getItemName(currentItem.item.menu_item_id),
        quantity: currentItem.quantity,
        fromQuantity: previousItem.quantity,
        toQuantity: currentItem.quantity,
      });
    }
  }

  for (const [key, previousItem] of previousItems) {
    if (!currentItems.has(key)) {
      removed.push({
        key,
        name: getItemName(previousItem.item.menu_item_id),
        quantity: previousItem.quantity,
      });
    }
  }

  const infoChanged =
    previous.table_number !== current.table_number ||
    previous.customer_name !== current.customer_name ||
    previous.notes !== current.notes ||
    previous.type !== current.type;

  if (added.length === 0 && removed.length === 0 && changed.length === 0 && !infoChanged) {
    return null;
  }

  return { added, removed, changed, infoChanged };
}

function getUpdateSummary(update: KitchenOrderUpdate): string {
  const parts: string[] = [];
  if (update.added.length > 0) parts.push(`${update.added.length} agregado${update.added.length !== 1 ? "s" : ""}`);
  if (update.removed.length > 0) parts.push(`${update.removed.length} retirado${update.removed.length !== 1 ? "s" : ""}`);
  if (update.changed.length > 0) parts.push(`${update.changed.length} cantidad${update.changed.length !== 1 ? "es" : ""} ajustada${update.changed.length !== 1 ? "s" : ""}`);
  if (update.infoChanged) parts.push("datos actualizados");
  return parts.join(" · ");
}

export function CocinaView() {
  const {
    activeOrders,
    loading,
    fetchActiveOrders,
    updateOrderStatus,
    subscribeToOrders,
    setMenuItemsMap,
  } = useOrderStore();
  const { menuItems, fetchMenuItems } = useCatalogStore();
  const prevOrders = useRef<Map<string, OrderWithItems>>(new Map());
  const hasHydratedOrdersRef = useRef(false);
  const updateTimers = useRef<Map<string, number>>(new Map());
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const alertingOrderIdsRef = useRef<Set<string>>(new Set());
  const alertPlaybackWarningRef = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<KitchenFilter>("pending");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [orderUpdates, setOrderUpdates] = useState<Record<string, KitchenOrderUpdate>>({});
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);

  useEffect(() => {
    const audio = new Audio(NEW_ORDER_SOUND_SRC);
    audio.loop = false;
    audio.preload = "auto";
    audio.volume = 1;
    alertAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      alertAudioRef.current = null;
    };
  }, []);

  const dismissOrderAlert = useCallback((orderId: string) => {
    alertingOrderIdsRef.current.delete(orderId);
    setNewOrderIds((current) => current.filter((id) => id !== orderId));

    const audio = alertAudioRef.current;
    audio?.pause();
    if (audio) audio.currentTime = 0;
  }, []);

  const playOrderAlert = useCallback(() => {
    const audio = alertAudioRef.current;
    if (!soundEnabled || !audio) return;

    audio.loop = false;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      if (!alertPlaybackWarningRef.current) {
        alertPlaybackWarningRef.current = true;
        toast.warning("Activa las alertas de sonido desde el botón del altavoz");
      }
    });
  }, [soundEnabled]);

  function clearAudioPlayback() {
    const audio = alertAudioRef.current;
    audio?.pause();
    if (audio) audio.currentTime = 0;
  }

  function handleSoundToggle() {
    if (soundEnabled) {
      setSoundEnabled(false);
      clearAudioPlayback();
      return;
    }

    setSoundEnabled(true);
    const audio = alertAudioRef.current;
    if (!audio) return;
    audio.muted = true;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      alertPlaybackWarningRef.current = false;
    }).catch(() => {
      audio.muted = false;
      toast.warning("No se pudo activar el sonido en este navegador");
    });
  }

  useEffect(() => {
    fetchActiveOrders();
    fetchMenuItems();
    const unsubscribe = subscribeToOrders();
    return () => unsubscribe();
  }, [fetchActiveOrders, fetchMenuItems, subscribeToOrders]);

  useEffect(() => {
    if (menuItems.length > 0) {
      setMenuItemsMap(menuItems);
    }
  }, [menuItems, setMenuItemsMap]);

  useEffect(() => {
    const currentOrders = new Map(activeOrders.map((order) => [order.id, order]));
    const previousOrders = prevOrders.current;
    const isInitialSnapshot = !hasHydratedOrdersRef.current;
    const newOrderIds = [...currentOrders.keys()].filter(
      (id) => !previousOrders.has(id)
    );
    const detectedUpdates: Record<string, KitchenOrderUpdate> = {};

    if (!isInitialSnapshot) {
      for (const [id, order] of currentOrders) {
        const previous = previousOrders.get(id);
        if (!previous) continue;
        const update = getOrderUpdate(previous, order, (menuItemId) =>
          menuItems.find((item) => item.id === menuItemId)?.name ?? "Producto"
        );
        if (update) {
          detectedUpdates[id] = update;
          toast.info(`Pedido #${order.number} actualizado`, {
            description: getUpdateSummary(update),
          });
          const existingTimer = updateTimers.current.get(id);
          if (existingTimer) window.clearTimeout(existingTimer);
          const timer = window.setTimeout(() => {
            setOrderUpdates((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
            updateTimers.current.delete(id);
          }, 20000);
          updateTimers.current.set(id, timer);
        }
      }
    }

    const newlyArrivedPendingIds = !isInitialSnapshot
      ? newOrderIds.filter((id) => currentOrders.get(id)?.status === "pending")
      : [];

    if (newlyArrivedPendingIds.length > 0) {
      for (const id of newlyArrivedPendingIds) {
        if (currentOrders.get(id)?.status === "pending") {
          alertingOrderIdsRef.current.add(id);
        }
      }
    }

    for (const id of alertingOrderIdsRef.current) {
      if (currentOrders.get(id)?.status !== "pending") {
        alertingOrderIdsRef.current.delete(id);
      }
    }

    const nextNewOrderIds = Array.from(alertingOrderIdsRef.current);
    setNewOrderIds((current) =>
      current.length === nextNewOrderIds.length &&
      current.every((id) => nextNewOrderIds.includes(id))
        ? current
        : nextNewOrderIds
    );
    if (newlyArrivedPendingIds.length > 0 && soundEnabled) playOrderAlert();
    if (Object.keys(detectedUpdates).length > 0) {
      window.setTimeout(() => {
        setOrderUpdates((current) => ({ ...current, ...detectedUpdates }));
      }, 0);
    }
    prevOrders.current = currentOrders;
    hasHydratedOrdersRef.current = true;
  }, [activeOrders, menuItems, playOrderAlert, soundEnabled]);

  useEffect(
    () => () => {
      updateTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const kitchenOrders = activeOrders.filter(
    (o) =>
      o.status === "pending" || o.status === "in_kitchen" || o.status === "ready"
  );
  const workOrders = kitchenOrders.filter(
    (order) => order.status === "pending" || order.status === "in_kitchen"
  );

  const urgentCount = workOrders.filter((order) =>
    ["warning", "critical"].includes(getUrgencyLevel(getMinutesElapsed(order.created_at, now.getTime())))
  ).length;

  const visibleOrders = useMemo(() => {
    const filtered = kitchenOrders.filter((order) => {
      if (filter === "pending") {
        return order.status === "pending" || order.status === "in_kitchen";
      }
      if (filter === "new") return order.status === "pending";
      if (filter === "urgent") {
        if (order.status === "ready") return false;
        return ["warning", "critical"].includes(
          getUrgencyLevel(getMinutesElapsed(order.created_at, now.getTime()))
        );
      }
      return order.status === filter;
    });

    return [...filtered].sort((a, b) => {
      const aUrgency = getUrgencyLevel(getMinutesElapsed(a.created_at, now.getTime()));
      const bUrgency = getUrgencyLevel(getMinutesElapsed(b.created_at, now.getTime()));
      const urgencyRank = { critical: 0, warning: 1, normal: 2 };
      if (urgencyRank[aUrgency] !== urgencyRank[bUrgency]) {
        return urgencyRank[aUrgency] - urgencyRank[bUrgency];
      }
      if (a.status === "ready" && b.status !== "ready") return 1;
      if (b.status === "ready" && a.status !== "ready") return -1;
      if (a.status === "in_kitchen" && b.status !== "in_kitchen") return -1;
      if (b.status === "in_kitchen" && a.status !== "in_kitchen") return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [filter, kitchenOrders, now]);

  async function handleStartPreparing(orderId: string) {
    dismissOrderAlert(orderId);
    const { error } = await updateOrderStatus(orderId, "in_kitchen");
    if (error) toast.error(error);
  }

  async function handleMarkReady(orderId: string) {
    const order = activeOrders.find((item) => item.id === orderId);
    const { error } = await updateOrderStatus(orderId, "ready");
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      order ? `Pedido #${order.number} marcado como listo` : "Pedido marcado como listo"
    );
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      toast.error("No se pudo activar la pantalla completa");
    }
  }

  function getItemName(menuItemId: string): string {
    return menuItems.find((m) => m.id === menuItemId)?.name ?? "Producto";
  }

  const stats = {
    nuevos: kitchenOrders.filter((o) => o.status === "pending").length,
    preparando: kitchenOrders.filter((o) => o.status === "in_kitchen").length,
    listos: kitchenOrders.filter((o) => o.status === "ready").length,
    pendientes: workOrders.length,
  };
  const timeLabel = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);
  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 shadow-sm sm:px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Ir al panel principal"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white transition-colors hover:bg-brand"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/20">
            <ChefHat size={24} />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold leading-none">Cocina</h1>
            <p className="mt-1 font-body text-[11px] text-muted-foreground">
              {visibleOrders.length} visible{visibleOrders.length !== 1 ? "s" : ""} · En vivo
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatPill icon={<Clock size={14} />} label="Nuevos" value={stats.nuevos} tone="muted" />
          <StatPill
            icon={<Flame size={14} />}
            label="Preparando"
            value={stats.preparando}
            tone="warning"
          />
          <StatPill
            icon={<CheckCircle2 size={14} />}
            label="Listos"
            value={stats.listos}
            tone="success"
          />
          <StatPill
            icon={<AlertTriangle size={14} />}
            label="Urgentes"
            value={urgentCount}
            tone="danger"
          />
          <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
            <div className="text-right">
              <time className="block font-data text-lg font-bold leading-none text-foreground">
                {timeLabel}
              </time>
              <span className="mt-1 block font-body text-[10px] capitalize text-muted-foreground">
                {dateLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Activar pantalla completa"}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5 sm:px-5">
        <span className="mr-1 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Ver
        </span>
        {(
          [
            { id: "pending" as const, label: "Pendientes", count: stats.pendientes },
            { id: "new" as const, label: "Nuevos", count: stats.nuevos },
            { id: "in_kitchen" as const, label: "Preparando", count: stats.preparando },
            { id: "ready" as const, label: "Listos sin entregar", count: stats.listos },
            { id: "urgent" as const, label: "Urgentes", count: urgentCount },
          ] as const
        ).map((option) => (
          <button
            data-tour={option.id === "pending" ? "kds-pending" : undefined}
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 font-heading text-xs font-bold transition-colors ${
              filter === option.id
                ? "border-brand bg-brand-light text-brand"
                : "border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-foreground"
            }`}
          >
            {option.label}
            <span className="font-data text-[10px]">{option.count}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void fetchActiveOrders()}
            disabled={loading}
            aria-label="Actualizar pedidos de cocina"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground hover:border-brand/50 hover:text-brand disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={handleSoundToggle}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? "Silenciar alertas" : "Activar alertas"}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
              soundEnabled
                ? "border-success/40 bg-success-light text-success"
                : "border-border bg-surface text-muted-foreground"
            }`}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {visibleOrders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface shadow-card">
              <ChefHat size={36} className="text-muted-foreground/40" />
            </div>
            <p className="font-heading text-lg font-bold text-muted-foreground">
              {workOrders.length === 0
                ? "Cocina despejada"
                : "No hay pedidos en este filtro"}
            </p>
            <p className="font-body text-sm text-muted-foreground">
              Los nuevos pedidos aparecen aquí automáticamente
            </p>
          </div>
        ) : (
          <div data-tour="kds-order-grid" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isNew={newOrderIds.includes(order.id)}
                  getItemName={getItemName}
                  update={orderUpdates[order.id]}
                  onDismissUpdate={() =>
                    setOrderUpdates((current) => {
                      const next = { ...current };
                      delete next[order.id];
                      return next;
                    })
                  }
                  onStartPreparing={handleStartPreparing}
                  onMarkReady={handleMarkReady}
                />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "muted" | "warning" | "success" | "danger";
}) {
  const tones = {
    muted: "bg-surface-raised text-muted-foreground",
    warning: "bg-warning-light text-warning",
    success: "bg-success-light text-success",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <div
      className={`flex h-10 items-center gap-2 rounded-full px-3 font-heading text-xs font-bold ${tones[tone]}`}
    >
      {icon}
      <span className="font-data text-sm font-bold text-foreground">{value}</span>
      {label}
    </div>
  );
}

function UpdateNotice({
  update,
  onDismiss,
}: {
  update: KitchenOrderUpdate;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-brand/35 bg-brand-light/45 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-heading text-xs font-bold text-brand">Pedido actualizado</p>
          <p className="mt-0.5 font-body text-[11px] text-muted-foreground">
            Revisa los cambios antes de preparar
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ocultar cambios del pedido"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-brand/70 hover:bg-brand/10 hover:text-brand"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 space-y-1 font-body text-xs">
        {update.added.map((change) => (
          <p key={`added-${change.key}`} className="font-semibold text-success">
            + {change.quantity}x {change.name}
          </p>
        ))}
        {update.removed.map((change) => (
          <p key={`removed-${change.key}`} className="text-destructive line-through">
            - {change.quantity}x {change.name}
          </p>
        ))}
        {update.changed.map((change) => (
          <p key={`changed-${change.key}`} className="font-semibold text-warning">
            {change.name}: {change.fromQuantity} → {change.toQuantity}
          </p>
        ))}
        {update.infoChanged && update.added.length === 0 && update.removed.length === 0 && update.changed.length === 0 ? (
          <p className="text-muted-foreground">Mesa, cliente o notas actualizadas</p>
        ) : null}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: OrderWithItems;
  isNew: boolean;
  getItemName: (id: string) => string;
  update?: KitchenOrderUpdate;
  onDismissUpdate: () => void;
  onStartPreparing: (id: string) => void;
  onMarkReady: (id: string) => void;
}

function OrderCard({
  order,
  isNew,
  getItemName,
  update,
  onDismissUpdate,
  onStartPreparing,
  onMarkReady,
}: OrderCardProps) {
  const minutesElapsed = getMinutesElapsed(order.created_at);
  const urgency = getUrgencyLevel(minutesElapsed);
  const typeLabel = TYPE_LABELS[order.type] ?? order.type;

  const header =
    order.status === "ready"
      ? "bg-success text-ink"
      : order.status === "in_kitchen"
        ? urgency === "critical"
          ? "bg-destructive text-ink"
          : urgency === "warning"
            ? "bg-warning text-ink"
            : "bg-ink text-white"
        : "bg-surface-raised text-foreground";

  const statusLabel =
    order.status === "pending"
      ? "Nuevo"
      : order.status === "in_kitchen"
        ? "Preparando"
        : "Listo";

  const newOrderClass = isNew
    ? urgency === "critical"
      ? "kds-new-order kds-new-order-critical"
      : urgency === "warning"
        ? "kds-new-order kds-new-order-warning"
        : "kds-new-order"
    : "";

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-shadow ${newOrderClass} ${
        update
          ? "kds-update-flash border-brand ring-2 ring-brand/20 shadow-[0_0_0_4px_rgba(245,20,95,0.08)]"
          : "border-border"
      }`}
    >
      <header className={`flex items-start justify-between gap-2 px-4 py-3 ${header}`}>
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-data text-3xl font-bold leading-none">#{order.number}</h2>
            {order.table_number ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5 font-heading text-xs font-bold">
                Mesa {order.table_number}
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex items-center gap-2 font-heading text-xs font-semibold opacity-90">
            <span>{statusLabel}</span>
            <span className="font-data text-sm tracking-tight">
              {formatElapsed(order.created_at)}
            </span>
            {order.customer_name ? ` · ${order.customer_name}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isNew ? (
            <span className="kds-new-order-badge rounded-full bg-white px-2.5 py-1 font-heading text-[10px] font-bold text-ink shadow-sm">
              Nuevo
            </span>
          ) : null}
          <span className="rounded-full bg-black/15 px-2.5 py-1 font-heading text-[10px] font-bold">
            {typeLabel}
          </span>
          {urgency !== "normal" ? (
            <span className="kds-urgent-pulse inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 font-heading text-[10px] font-bold">
              <AlertTriangle size={10} />
              {urgency === "critical" ? "Urgente" : "Demora"}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col p-4">
        {update ? (
          <UpdateNotice update={update} onDismiss={onDismissUpdate} />
        ) : null}
        <ul className="mb-4 flex-1 space-y-3">
          {order.items.map((item, i) => (
            <li
              key={i}
              className={
                update?.added.some((change) => change.key === getItemKey(item))
                  ? "rounded-xl border border-success/35 bg-success-light/40 p-2"
                  : undefined
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="font-data text-lg font-bold text-brand">{item.quantity}x</span>
                <p className="font-heading text-base font-bold leading-snug">
                  {getItemName(item.menu_item_id)}
                </p>
              </div>
              {item.selected_modifiers?.length ? (
                <p className="ml-8 font-body text-sm text-muted-foreground">
                  {item.selected_modifiers
                    .map((m) =>
                      m.description ? `${m.option} (${m.description})` : m.option
                    )
                    .join(", ")}
                </p>
              ) : null}
              {item.notes ? (
                <p className="ml-8 mt-1 rounded-lg bg-brand-light px-2 py-1 font-body text-xs font-semibold text-brand">
                  Nota: {item.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {order.status === "pending" ? (
          <button
            type="button"
            onClick={() => onStartPreparing(order.id)}
            className="action-warning flex h-14 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold"
          >
            <Flame size={18} />
            Empezar a preparar
          </button>
        ) : null}

        {order.status === "in_kitchen" ? (
          <button
            type="button"
            onClick={() => onMarkReady(order.id)}
            className="action-success flex h-14 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold"
          >
            <CheckCircle2 size={18} />
            Marcar como listo
          </button>
        ) : null}

        {order.status === "ready" ? (
          <div className="flex h-14 items-center justify-center gap-2 rounded-xl bg-success-light font-heading text-sm font-bold text-success">
            <CheckCircle2 size={18} />
            Listo para entregar
          </div>
        ) : null}
      </div>
    </article>
  );
}
