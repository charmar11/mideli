"use client";

import {
  ArrowDown,
  ArrowLeft,
  Bot,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  HandHelping,
  MapPinned,
  MessageCircleMore,
  MoreVertical,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  claimWhatsappConversationAction,
  clearWhatsappConversationMessagesAction,
  closeWhatsappConversationAction,
  getWhatsappConversationMessagesAction,
  getWhatsappInboxSnapshotAction,
  resumeWhatsappBotAction,
  sendWhatsappHumanReplyAction,
} from "@/lib/actions/whatsapp";
import type {
  WhatsappAdminConversation,
  WhatsappAdminMessage,
  WhatsappControlData,
} from "@/lib/whatsapp/admin-types";
import {
  filterWhatsappConversations,
  WHATSAPP_INBOX_FILTERS,
  type WhatsappInboxFilter,
  whatsappConversationStatus,
  whatsappMessageStatus,
  whatsappOrderStatus,
} from "@/lib/whatsapp/inbox";
import { formatPhoneForDisplay } from "@/lib/whatsapp/normalize";
import { WhatsappMessageText } from "@/components/whatsapp/whatsapp-message-text";

type Props = {
  data: WhatsappControlData;
  focusConversationId?: string | null;
  onMobileChatModeChange?: (open: boolean) => void;
};

function formatDate(value: string | null) {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Hermosillo",
  }).format(new Date(value));
}

function sameConversations(
  current: WhatsappAdminConversation[],
  next: WhatsappAdminConversation[]
) {
  return current.length === next.length && current.every((item, index) => {
    const candidate = next[index];
    return candidate
      && item.id === candidate.id
      && item.updatedAt === candidate.updatedAt
      && item.status === candidate.status
      && item.botEnabled === candidate.botEnabled
      && item.assignedTo === candidate.assignedTo
      && item.assignedName === candidate.assignedName
      && item.customerName === candidate.customerName
      && item.lastMessage === candidate.lastMessage
      && item.lastMessageDirection === candidate.lastMessageDirection
      && item.lastMessageStatus === candidate.lastMessageStatus
      && JSON.stringify(item.latestOrder) === JSON.stringify(candidate.latestOrder);
  });
}

function sameMessages(current: WhatsappAdminMessage[], next: WhatsappAdminMessage[]) {
  return current.length === next.length && current.every((item, index) => {
    const candidate = next[index];
    return candidate
      && item.id === candidate.id
      && item.status === candidate.status
      && item.body === candidate.body
      && item.occurredAt === candidate.occurredAt;
  });
}

function statusTone(tone: ReturnType<typeof whatsappConversationStatus>["tone"]) {
  if (tone === "warning") return "bg-warning/15 text-warning";
  if (tone === "success") return "bg-success/15 text-success";
  if (tone === "brand") return "bg-brand/15 text-brand";
  if (tone === "danger") return "bg-danger/15 text-danger";
  return "bg-surface-raised text-muted-foreground";
}

function statusDotTone(tone: ReturnType<typeof whatsappConversationStatus>["tone"]) {
  if (tone === "warning") return "bg-warning";
  if (tone === "success") return "bg-success";
  if (tone === "brand") return "bg-brand";
  if (tone === "danger") return "bg-danger";
  return "bg-muted-foreground";
}

function filterTone(filter: WhatsappInboxFilter) {
  if (filter === "attention") return "bg-warning/15 text-warning";
  if (filter === "active") return "bg-success/15 text-success";
  if (filter === "closed") return "bg-surface-raised text-muted-foreground";
  return "bg-brand/15 text-brand";
}

function customerLabel(conversation: WhatsappAdminConversation) {
  return conversation.customerName || formatPhoneForDisplay(conversation.phone);
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-h-0 w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-surface ${className}`}>
      {children}
    </section>
  );
}

function ConversationList({
  conversations,
  attentionCount,
  selectedId,
  query,
  filter,
  syncing,
  onQuery,
  onFilter,
  onSelect,
  onSync,
}: {
  conversations: WhatsappAdminConversation[];
  attentionCount: number;
  selectedId: string | null;
  query: string;
  filter: WhatsappInboxFilter;
  syncing: boolean;
  onQuery: (value: string) => void;
  onFilter: (value: WhatsappInboxFilter) => void;
  onSelect: (conversation: WhatsappAdminConversation) => void;
  onSync: () => void;
}) {
  const filterCounts: Record<WhatsappInboxFilter, number> = {
    attention: conversations.filter((item) => item.status === "handoff").length,
    active: conversations.filter((item) => item.status === "active" || item.status === "confirmed").length,
    closed: conversations.filter((item) => item.status === "closed" || item.status === "cancelled").length,
    all: conversations.length,
  };

  return (
    <>
      <div className="shrink-0 border-b border-border bg-surface p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success sm:hidden">
            <MessageCircleMore aria-hidden size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-base font-bold">Conversaciones</h2>
              <span className="rounded-full bg-background px-2 py-0.5 font-data text-[10px] text-muted-foreground sm:hidden">
                {conversations.length}
              </span>
            </div>
            <p className="font-body text-xs text-muted-foreground">
              {attentionCount > 0 ? `${attentionCount} esperan al equipo` : "Todo está atendido"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={onSync}
            disabled={syncing}
            aria-label="Actualizar conversaciones"
          >
            <RefreshCw aria-hidden className={syncing ? "animate-spin" : ""} size={17} />
          </Button>
        </div>
        <label className="relative mt-3 block">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Nombre, teléfono o folio"
            className="h-12 rounded-xl bg-background pl-10 sm:h-11"
            aria-label="Buscar conversaciones"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:flex" aria-label="Filtrar conversaciones">
          {WHATSAPP_INBOX_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl px-3 font-heading text-[11px] font-bold transition-colors sm:h-10 sm:min-h-0 sm:shrink-0 sm:px-3 ${
                filter === item.id
                  ? `${filterTone(item.id)} ring-1 ring-current/15`
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              <span className="truncate">{item.label}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-data text-[10px] tabular-nums ${filter === item.id ? "bg-black/10" : "bg-background text-muted-foreground"}`}>
                {filterCounts[item.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="whatsapp-scroll-y min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2 pb-3 [content-visibility:auto]">
        {conversations.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center p-6 text-center">
            <div>
              <MessageCircleMore className="mx-auto text-muted-foreground" size={28} />
              <p className="mt-3 font-heading text-sm font-bold">No hay resultados</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Cambia el filtro o busca otro teléfono.
              </p>
            </div>
          </div>
        ) : conversations.map((conversation) => {
          const status = whatsappConversationStatus(conversation.status);
          const selected = selectedId === conversation.id;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation)}
              aria-current={selected ? "true" : undefined}
              className={`mb-1.5 w-full rounded-xl border border-transparent p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99] sm:p-3 ${
                selected
                  ? "border-brand/30 bg-brand/12 shadow-[inset_3px_0_0_var(--brand)]"
                : conversation.status === "handoff"
                    ? "border-warning/15 bg-warning/7 hover:bg-warning/12"
                    : "hover:bg-background"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold ${
                  conversation.status === "handoff"
                    ? "bg-warning/15 text-warning"
                    : "bg-surface-raised text-cream"
                }`}>
                  {(conversation.customerName || conversation.phone).trim().charAt(0).toUpperCase() || "#"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="block truncate font-heading text-sm font-bold">
                        {customerLabel(conversation)}
                      </strong>
                      {conversation.customerName ? (
                        <span className="block font-data text-[10px] text-muted-foreground">
                          {formatPhoneForDisplay(conversation.phone)}
                        </span>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 font-heading text-[9px] font-bold uppercase tracking-wide ${statusTone(status.tone)}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className={`mt-1.5 line-clamp-2 font-body text-xs leading-relaxed ${
                    conversation.lastMessageDirection === "inbound"
                      ? "text-foreground/85"
                      : "text-muted-foreground"
                  }`}>
                    {conversation.lastMessageDirection === "outbound" ? "Mideli: " : ""}
                    {conversation.lastMessage}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-data text-[10px] text-muted-foreground">
                      {formatDate(conversation.updatedAt)}
                    </span>
                    {conversation.latestOrder ? (
                      <span className="rounded-md bg-background px-2 py-1 font-data text-[10px] font-bold text-gold">
                        #{conversation.latestOrder.number}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function OrderContext({
  conversation,
  compact = false,
}: {
  conversation: WhatsappAdminConversation;
  compact?: boolean;
}) {
  const order = conversation.latestOrder;
  const address = order?.deliveryAddress || conversation.context.address;
  const reference = order?.deliveryReference || conversation.context.addressReference;
  const paymentMethod = order?.paymentMethod || conversation.context.paymentMethod;
  const items = conversation.context.items;
  const orderNotes = conversation.context.orderNotes;
  const deliveryNotes = conversation.context.deliveryNotes;
  const total = order?.total ?? conversation.context.total;
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
    } catch {
      toast.error("No se pudo copiar en este dispositivo");
    }
  }

  const content = (
    <div className={compact ? "space-y-3 pt-3" : "whatsapp-scroll-y min-h-0 flex-1 space-y-4 overflow-y-auto p-4"}>
      <div>
        <p className="font-heading text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Cliente
        </p>
        <p className="mt-2 font-heading text-sm font-bold">{customerLabel(conversation)}</p>
        <a
          href={`tel:+${conversation.phone}`}
          className="mt-1 inline-flex min-h-9 items-center gap-2 font-data text-xs text-muted-foreground hover:text-cream"
        >
          <Phone aria-hidden size={14} />
          {formatPhoneForDisplay(conversation.phone)}
        </a>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          {conversation.assignedName
            ? `Atiende ${conversation.assignedName}`
            : conversation.botEnabled
              ? "Atiende el bot"
              : "Sin responsable asignado"}
        </p>
      </div>

      <div className="h-px bg-border" />

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="font-heading text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Comanda
          </p>
          {order ? (
            <span className="font-data text-xs font-bold text-gold">Pedido #{order.number}</span>
          ) : null}
        </div>
        {order ? (
          <p className="mt-2 inline-flex rounded-full bg-success/12 px-2.5 py-1 font-heading text-[10px] font-bold text-success">
            {whatsappOrderStatus(order.status, order.deliveryStatus)}
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          {items.length > 0 ? items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-start gap-2 font-body text-xs">
              <span className="font-data font-bold text-brand">{item.quantity}x</span>
              <span className="min-w-0 flex-1 text-cream">
                {item.name}
                {item.notes ? (
                  <span className="mt-0.5 block text-[11px] text-warning">Indicación: {item.notes}</span>
                ) : null}
              </span>
            </div>
          )) : (
            <p className="font-body text-xs text-muted-foreground">El carrito aún está vacío.</p>
          )}
        </div>
        {orderNotes ? (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 font-body text-xs text-warning">
            Indicación general: {orderNotes}
          </p>
        ) : null}
        <div className="mt-3 flex items-end justify-between rounded-xl bg-background px-3 py-2.5">
          <div>
            <p className="font-heading text-[10px] font-bold text-muted-foreground">TOTAL</p>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              {order?.type === "domicilio" || conversation.context.serviceType === "domicilio"
                ? "A domicilio"
                : order?.type === "para_llevar" || conversation.context.serviceType === "para_llevar"
                  ? "Para recoger"
                  : "Servicio por definir"}
            </p>
          </div>
          <strong className="font-data text-xl tabular-nums text-brand">${total}</strong>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <p className="font-heading text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Entrega y pago
        </p>
        <p className="mt-2 font-body text-xs leading-relaxed text-cream">
          {address || "Domicilio pendiente"}
        </p>
        {reference ? (
          <p className="mt-1 font-body text-xs text-muted-foreground">Referencia: {reference}</p>
        ) : null}
        {deliveryNotes && !(reference || "").includes(deliveryNotes) ? (
          <p className="mt-1 font-body text-xs text-muted-foreground">Acceso: {deliveryNotes}</p>
        ) : null}
        {address && !order ? (
          <p className={`mt-2 inline-flex rounded-full px-2 py-1 font-heading text-[10px] font-bold ${conversation.context.addressConfirmed ? "bg-success/12 text-success" : "bg-warning/12 text-warning"}`}>
            {conversation.context.addressConfirmed ? "Domicilio confirmado" : "Domicilio por confirmar"}
          </p>
        ) : null}
        <p className="mt-2 font-body text-xs text-muted-foreground">
          Pago: {paymentMethod || "por definir"}
          {order?.requestedCashTendered ? ` · lleva $${order.requestedCashTendered}` : ""}
        </p>
        {address ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2"
              onClick={() => void copy([address, reference].filter(Boolean).join(", "), "Dirección copiada")}
            >
              <Copy aria-hidden size={14} />
              Copiar
            </Button>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-success px-3 font-heading text-sm font-semibold text-white transition-colors hover:bg-success/85"
            >
              <MapPinned aria-hidden size={14} />
              Mapa
            </a>
          </div>
        ) : null}
        {items.length > 0 ? (
          <a
            href={`/dashboard/mesero?whatsappConversation=${encodeURIComponent(conversation.id)}`}
            className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 font-heading text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            <ShoppingBag aria-hidden size={15} />
            {order ? "Abrir pedido en Mesero" : "Cargar pedido en Mesero"}
          </a>
        ) : null}
      </div>

      {conversation.handoffReason ? (
        <div className="rounded-xl bg-warning/10 p-3 text-warning">
          <div className="flex items-center gap-2">
            <HandHelping aria-hidden size={15} />
            <p className="font-heading text-xs font-bold">Motivo de atención</p>
          </div>
          <p className="mt-1 font-body text-xs text-warning/80">{conversation.handoffReason}</p>
        </div>
      ) : null}
    </div>
  );

  if (compact) return content;
  return (
    <Panel className="hidden flex-col xl:flex">
      <div className="border-b border-border p-4">
        <h2 className="font-heading text-sm font-bold">Detalle operativo</h2>
        <p className="mt-1 font-body text-xs text-muted-foreground">Lo necesario para resolver el pedido.</p>
      </div>
      {content}
    </Panel>
  );
}

function ChatPanel({
  conversation,
  messages,
  loading,
  pending,
  draft,
  showNewMessages,
  admin,
  onBack,
  onDraft,
  onSend,
  onRun,
  onClear,
  onViewportScroll,
  onScrollToLatest,
  viewportRef,
}: {
  conversation: WhatsappAdminConversation | null;
  messages: WhatsappAdminMessage[];
  loading: boolean;
  pending: boolean;
  draft: string;
  showNewMessages: boolean;
  admin: boolean;
  onBack: () => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onRun: (action: "claim" | "resume" | "close") => void;
  onClear: () => void;
  onViewportScroll: () => void;
  onScrollToLatest: () => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const contextCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showContext) return;
    const trigger = contextTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    contextCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowContext(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [showContext]);

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
        <div>
          <MessageCircleMore className="mx-auto" size={30} />
          <p className="mt-3 font-heading text-sm font-bold text-cream">Selecciona una conversación</p>
          <p className="mt-1 font-body text-xs">Aquí aparecerán los mensajes y la comanda.</p>
        </div>
      </div>
    );
  }

  const status = whatsappConversationStatus(conversation.status);
  const closed = conversation.status === "closed" || conversation.status === "cancelled";

  return (
    <>
      <header className="flex min-h-[60px] shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5 sm:min-h-[68px] sm:gap-2 sm:px-3 sm:py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 lg:hidden"
          onClick={onBack}
          aria-label="Volver a conversaciones"
        >
          <ArrowLeft aria-hidden size={19} />
        </Button>
        <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-success/15 font-heading text-sm font-bold text-success sm:flex">
          {(conversation.customerName || conversation.phone).trim().charAt(0).toUpperCase() || "#"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-sm font-bold sm:text-base">
            {customerLabel(conversation)}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span className={`hidden rounded-full px-2 py-0.5 font-heading text-[9px] font-bold uppercase tracking-wide sm:inline-flex ${statusTone(status.tone)}`}>
              {status.label}
            </span>
            <span className={`inline-flex size-2 shrink-0 rounded-full sm:hidden ${statusDotTone(status.tone)}`}>
              <span className="sr-only">{status.label}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap font-data text-[10px] text-muted-foreground">
              {formatPhoneForDisplay(conversation.phone)}
            </span>
          </div>
        </div>

        {!closed ? conversation.botEnabled ? (
          <Button
            type="button"
            variant="success"
            className="h-11 gap-2 px-3"
            disabled={pending}
            onClick={() => onRun("claim")}
          >
            <UserRoundCheck aria-hidden size={15} />
            <span className="hidden sm:inline">Tomar chat</span>
            <span className="sm:hidden">Tomar</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 px-3"
            disabled={pending}
            onClick={() => onRun("resume")}
          >
            <Bot aria-hidden size={15} />
            <span className="hidden sm:inline">Devolver al bot</span>
            <span className="sm:hidden">Bot</span>
          </Button>
        ) : null}

        <details className="group relative shrink-0">
          <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <MoreVertical aria-hidden size={18} />
            <span className="sr-only">Más acciones</span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-border bg-popover p-1.5 shadow-float">
            {!closed ? (
              <button
                type="button"
                onClick={() => onRun("close")}
                disabled={pending}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck aria-hidden size={16} />
                Cerrar conversación
              </button>
            ) : null}
            {admin ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={pending}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-heading text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 aria-hidden size={16} />
                Limpiar mensajes
              </button>
            ) : null}
          </div>
        </details>
      </header>

      <div className="shrink-0 border-b border-border bg-surface-raised/35 px-3 py-1 xl:hidden">
        <button
          ref={contextTriggerRef}
          type="button"
          className="flex min-h-10 w-full items-center gap-2 rounded-xl px-1 font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-12"
          onClick={() => setShowContext(true)}
          aria-haspopup="dialog"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand/12 text-brand">
            {conversation.latestOrder ? `#${conversation.latestOrder.number}` : "🧾"}
          </span>
          <span className="min-w-0 flex-1">
            {conversation.latestOrder ? "Ver pedido y entrega" : "Ver carrito y cliente"}
          </span>
          <ChevronDown aria-hidden size={16} />
        </button>
      </div>

      {showContext ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-4 xl:hidden"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowContext(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-order-context-title"
            className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-float sm:max-w-xl sm:rounded-3xl"
          >
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-brand/12 font-data text-xs font-bold text-brand">
                {conversation.latestOrder ? `#${conversation.latestOrder.number}` : "🧾"}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="whatsapp-order-context-title" className="font-heading text-sm font-bold">
                  {conversation.latestOrder ? "Pedido y entrega" : "Carrito y cliente"}
                </h2>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {customerLabel(conversation)}
                </p>
              </div>
              <Button
                ref={contextCloseRef}
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                onClick={() => setShowContext(false)}
                aria-label="Cerrar detalle"
              >
                <X aria-hidden size={19} />
              </Button>
            </header>
            <div className="whatsapp-scroll-y min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-4">
              <OrderContext conversation={conversation} compact />
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      {confirmClear ? (
        <div className="border-b border-danger/25 bg-danger/10 p-3">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden className="mt-0.5 shrink-0 text-danger" size={17} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-xs font-bold text-danger">¿Limpiar y ocultar esta conversación?</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Se borrarán los mensajes visibles y la conversación dejará de aparecer en la bandeja. Los pedidos, folios y auditoría se conservarán.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="danger"
                  className="h-10"
                  disabled={pending}
                  onClick={() => {
                    setConfirmClear(false);
                    onClear();
                  }}
                >
                  Limpiar y ocultar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  disabled={pending}
                  onClick={() => setConfirmClear(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={viewportRef}
          onScroll={onViewportScroll}
          className="whatsapp-scroll-y absolute inset-0 space-y-3 overflow-y-auto overscroll-contain bg-[#111014] px-3 py-4 touch-pan-y sm:px-5"
          aria-live="polite"
        >
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 font-body text-sm text-muted-foreground">
              <RefreshCw className="animate-spin" size={16} />
              Cargando mensajes
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-center">
              <div>
                <MessageCircleMore className="mx-auto text-muted-foreground" size={26} />
                <p className="mt-3 font-heading text-sm font-bold">Sin mensajes visibles</p>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  El contenido pudo haberse limpiado por privacidad.
                </p>
              </div>
            </div>
          ) : messages.map((item) => {
            const outbound = item.direction === "outbound";
            const failed = item.status === "failed";
            return (
              <div key={item.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 sm:max-w-[76%] ${
                  outbound
                    ? failed
                      ? "rounded-br-md bg-danger/15 text-cream ring-1 ring-danger/35"
                      : "rounded-br-md bg-brand text-white"
                    : "rounded-bl-md bg-surface text-foreground ring-1 ring-border/80"
                }`}>
                  <p className="font-body text-sm leading-relaxed">
                    {item.body ? (
                      <WhatsappMessageText body={item.body} />
                    ) : (
                      "Contenido eliminado por privacidad"
                    )}
                  </p>
                  <div className={`mt-1.5 flex items-center justify-end gap-1.5 font-data text-[9px] ${
                    outbound && !failed ? "text-white/65" : failed ? "text-danger" : "text-muted-foreground"
                  }`}>
                    {outbound ? <CheckCheck aria-hidden size={11} /> : null}
                    <span>{whatsappMessageStatus(item.status)}</span>
                    <span>·</span>
                    <span>{formatDate(item.occurredAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {showNewMessages ? (
          <Button
            type="button"
            className="absolute bottom-3 left-1/2 h-10 -translate-x-1/2 gap-2 rounded-full bg-cream px-4 text-ink shadow-float hover:bg-cream/90"
            onClick={onScrollToLatest}
          >
            <ArrowDown aria-hidden size={15} />
            Mensajes nuevos
          </Button>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-surface/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:p-3">
        {closed ? (
          <div className="flex min-h-12 items-center justify-center rounded-xl bg-background px-4 text-center font-body text-xs text-muted-foreground">
            Esta conversación está cerrada. Un mensaje nuevo del cliente abrirá otra.
          </div>
        ) : (
          <>
            {conversation.botEnabled ? (
            <p className="mb-2 hidden items-center gap-1.5 font-body text-[11px] text-muted-foreground sm:flex">
                <Bot aria-hidden size={13} />
                Al responder, tomarás la conversación y el bot se pausará.
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSend();
                  }
                }}
                rows={1}
                maxLength={1500}
                placeholder="Escribe una respuesta..."
                className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-3 font-body text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
                aria-label="Respuesta al cliente"
              />
              <Button
                type="button"
                variant="success"
                size="icon"
                className="size-12 shrink-0 rounded-full"
                disabled={pending || !draft.trim()}
                onClick={onSend}
                aria-label="Enviar respuesta"
              >
                <Send aria-hidden size={17} />
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function WhatsappInbox({ data, focusConversationId = null, onMobileChatModeChange }: Props) {
  const admin = data.role === "owner" || data.role === "admin";
  const [conversations, setConversations] = useState(data.conversations);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    data.conversations.some((item) => item.id === focusConversationId)
      ? focusConversationId
      : data.conversations[0]?.id ?? null
  );
  const [mobileChatOpen, setMobileChatOpen] = useState(() =>
    Boolean(
      focusConversationId &&
      data.conversations.some((item) => item.id === focusConversationId)
    )
  );
  const [messages, setMessages] = useState<WhatsappAdminMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<WhatsappInboxFilter>(
    data.conversations.some((item) => item.status === "handoff")
      ? "attention"
      : data.conversations.some((item) => item.status === "active" || item.status === "confirmed")
        ? "active"
        : "all"
  );
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [showNewMessages, setShowNewMessages] = useState(false);
  const selectedIdRef = useRef(selectedId);
  const syncingRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const lastConversationRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    onMobileChatModeChange?.(mobileChatOpen);
    document.body.classList.toggle("mideli-whatsapp-chat-open", mobileChatOpen);
    return () => {
      document.body.classList.remove("mideli-whatsapp-chat-open");
    };
  }, [mobileChatOpen, onMobileChatModeChange]);

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const loading = Boolean(selectedId && loadedConversationId !== selectedId);
  const filteredConversations = useMemo(
    () => filterWhatsappConversations(conversations, filter, deferredQuery),
    [conversations, filter, deferredQuery]
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowNewMessages(false);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void getWhatsappConversationMessagesAction(selectedId).then((result) => {
      if (!active) return;
      if (!result.success) {
        toast.error(result.error);
        setLoadedConversationId(selectedId);
        return;
      }
      setMessages(result.data);
      previousMessageCountRef.current = result.data.length;
      setLoadedConversationId(selectedId);
    });
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (loading || !selectedId) return;
    const changedConversation = lastConversationRef.current !== selectedId;
    const hasMoreMessages = messages.length > previousMessageCountRef.current;
    lastConversationRef.current = selectedId;

    if (changedConversation || nearBottomRef.current) {
      const frame = window.requestAnimationFrame(() => {
        scrollToLatest(changedConversation ? "auto" : "smooth");
      });
      previousMessageCountRef.current = messages.length;
      return () => window.cancelAnimationFrame(frame);
    }
    if (hasMoreMessages) setShowNewMessages(true);
    previousMessageCountRef.current = messages.length;
  }, [loading, messages, scrollToLatest, selectedId]);

  const syncInbox = useCallback(async () => {
    if (syncingRef.current || document.visibilityState !== "visible") return;
    syncingRef.current = true;
    setSyncing(true);
    const requestedConversationId = selectedIdRef.current;
    try {
      const result = await getWhatsappInboxSnapshotAction(requestedConversationId);
      if (!result.success) return;
      setConversations((current) => sameConversations(current, result.data.conversations)
        ? current
        : result.data.conversations);
      if (result.data.conversationId === selectedIdRef.current) {
        setMessages((current) => sameMessages(current, result.data.messages)
          ? current
          : result.data.messages);
        setLoadedConversationId(result.data.conversationId);
      }
    } catch {
      // Conserva la última instantánea útil y reintenta en el siguiente ciclo.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let timeoutId: number;
    let stopped = false;
    const schedule = () => {
      timeoutId = window.setTimeout(async () => {
        await syncInbox();
        if (!stopped) schedule();
      }, 2_000);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncInbox();
    };
    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncInbox]);

  function openConversation(conversation: WhatsappAdminConversation) {
    if (conversation.id !== selectedId) {
      setMessages([]);
      setLoadedConversationId(null);
      previousMessageCountRef.current = 0;
      nearBottomRef.current = true;
      setShowNewMessages(false);
      setSelectedId(conversation.id);
    }
    setMobileChatOpen(true);
  }

  function run(action: "claim" | "resume" | "close") {
    if (!selected) return;
    const handlers = {
      claim: () => claimWhatsappConversationAction(selected.id),
      resume: () => resumeWhatsappBotAction(selected.id),
      close: () => closeWhatsappConversationAction(selected.id),
    };
    const success = {
      claim: "Conversación asignada",
      resume: "Bot reactivado",
      close: "Conversación cerrada",
    };
    startTransition(async () => {
      const result = await handlers[action]();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(success[action]);
      await syncInbox();
    });
  }

  function sendReply() {
    if (!selected || !draft.trim()) return;
    const body = draft.trim();
    startTransition(async () => {
      const result = await sendWhatsappHumanReplyAction(selected.id, body);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      await syncInbox();
      scrollToLatest();
      toast.success("Mensaje enviado");
    });
  }

  function clearMessages() {
    if (!selected) return;
    startTransition(async () => {
      const result = await clearWhatsappConversationMessagesAction(selected.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.redacted === 1
          ? "1 mensaje borrado. La conversación se ocultó"
          : `${result.data.redacted} mensajes borrados. La conversación se ocultó`
      );
      selectedIdRef.current = null;
      setSelectedId(null);
      setMessages([]);
      setLoadedConversationId(null);
      setMobileChatOpen(false);
      await syncInbox();
    });
  }

  function handleViewportScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distance < 96;
    nearBottomRef.current = nearBottom;
    if (nearBottom && showNewMessages) setShowNewMessages(false);
  }

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 max-w-full flex-1 gap-3 overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)_19rem]">
      <Panel className={`${mobileChatOpen ? "hidden lg:flex" : "flex"} flex-col rounded-none border-0 lg:rounded-2xl lg:border`}>
        <ConversationList
          conversations={filteredConversations}
          attentionCount={conversations.filter((item) => item.status === "handoff").length}
          selectedId={selectedId}
          query={query}
          filter={filter}
          syncing={syncing}
          onQuery={setQuery}
          onFilter={setFilter}
          onSelect={openConversation}
          onSync={() => void syncInbox()}
        />
      </Panel>

      <Panel className={`${mobileChatOpen ? "flex" : "hidden lg:flex"} flex-col rounded-none border-0 lg:rounded-2xl lg:border`}>
        <ChatPanel
          key={selected?.id ?? "empty"}
          conversation={selected}
          messages={messages}
          loading={loading}
          pending={pending}
          draft={draft}
          showNewMessages={showNewMessages}
          admin={admin}
          onBack={() => setMobileChatOpen(false)}
          onDraft={setDraft}
          onSend={sendReply}
          onRun={run}
          onClear={clearMessages}
          onViewportScroll={handleViewportScroll}
          onScrollToLatest={() => scrollToLatest()}
          viewportRef={viewportRef}
        />
      </Panel>

      {selected ? <OrderContext conversation={selected} /> : (
        <Panel className="hidden items-center justify-center p-6 text-center xl:flex">
          <div>
            <Clock3 className="mx-auto text-muted-foreground" size={24} />
            <p className="mt-3 font-heading text-sm font-bold">Sin conversación abierta</p>
          </div>
        </Panel>
      )}
    </div>
  );
}
