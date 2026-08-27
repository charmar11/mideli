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
  Trash2,
  UserRoundCheck,
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

type Props = {
  data: WhatsappControlData;
};

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("52") && digits.length >= 12) {
    const local = digits.slice(-10);
    return `+52 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+${digits}`;
}

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

function customerLabel(conversation: WhatsappAdminConversation) {
  return conversation.customerName || formatPhone(conversation.phone);
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-h-0 overflow-hidden rounded-2xl border border-border bg-surface ${className}`}>
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
  return (
    <>
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-bold">Conversaciones</h2>
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
            className="h-11 bg-background pl-10"
            aria-label="Buscar conversaciones"
          />
        </label>
        <div className="pos-scroll mt-2 flex gap-1 overflow-x-auto" aria-label="Filtrar conversaciones">
          {WHATSAPP_INBOX_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`h-9 shrink-0 rounded-lg px-3 font-heading text-[11px] font-bold transition-colors ${
                filter === item.id
                  ? "bg-cream text-ink"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-2 [content-visibility:auto]">
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
              className={`mb-1 w-full rounded-xl p-3 text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99] ${
                selected
                  ? "bg-brand/12 shadow-[inset_3px_0_0_var(--brand)]"
                  : conversation.status === "handoff"
                    ? "bg-warning/7 hover:bg-warning/12"
                    : "hover:bg-background"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold ${
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
                          {formatPhone(conversation.phone)}
                        </span>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 font-heading text-[9px] font-bold uppercase tracking-wide ${statusTone(status.tone)}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className={`mt-2 line-clamp-2 font-body text-xs ${
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
    <div className={compact ? "space-y-3 pt-3" : "pos-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4"}>
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
          {formatPhone(conversation.phone)}
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
              <span className="min-w-0 flex-1 text-cream">{item.name}</span>
            </div>
          )) : (
            <p className="font-body text-xs text-muted-foreground">El carrito aún está vacío.</p>
          )}
        </div>
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
      <header className="flex min-h-[68px] items-center gap-2 border-b border-border px-3 py-2">
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
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-sm font-bold sm:text-base">
            {customerLabel(conversation)}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 font-heading text-[9px] font-bold uppercase tracking-wide ${statusTone(status.tone)}`}>
              {status.label}
            </span>
            {conversation.customerName ? (
              <span className="hidden truncate font-data text-[10px] text-muted-foreground sm:inline">
                {formatPhone(conversation.phone)}
              </span>
            ) : null}
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

        <details className="group relative">
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

      <details className="group border-b border-border bg-surface-raised/35 px-3 py-2 xl:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-heading text-xs font-bold [&::-webkit-details-marker]:hidden">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand/12 text-brand">
            {conversation.latestOrder ? `#${conversation.latestOrder.number}` : "🧾"}
          </span>
          <span className="min-w-0 flex-1">
            {conversation.latestOrder ? "Ver pedido y entrega" : "Ver carrito y cliente"}
          </span>
          <ChevronDown aria-hidden className="transition-transform group-open:rotate-180" size={16} />
        </summary>
        <OrderContext conversation={conversation} compact />
      </details>

      {confirmClear ? (
        <div className="border-b border-danger/25 bg-danger/10 p-3">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden className="mt-0.5 shrink-0 text-danger" size={17} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-xs font-bold text-danger">¿Limpiar todo el contenido del chat?</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Los pedidos, folios y auditoría se conservarán. Los mensajes no se pueden recuperar.
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
                  Limpiar mensajes
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
          className="pos-scroll absolute inset-0 space-y-3 overflow-y-auto bg-background/60 px-3 py-4 sm:px-5"
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
                  <p className="whitespace-pre-wrap break-words font-body text-sm leading-relaxed">
                    {item.body || "Contenido eliminado por privacidad"}
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

      <div className="border-t border-border bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {closed ? (
          <div className="flex min-h-12 items-center justify-center rounded-xl bg-background px-4 text-center font-body text-xs text-muted-foreground">
            Esta conversación está cerrada. Un mensaje nuevo del cliente abrirá otra.
          </div>
        ) : (
          <>
            {conversation.botEnabled ? (
              <p className="mb-2 flex items-center gap-1.5 font-body text-[11px] text-muted-foreground">
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
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
                aria-label="Respuesta al cliente"
              />
              <Button
                type="button"
                variant="success"
                size="icon"
                className="size-11"
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

export function WhatsappInbox({ data }: Props) {
  const admin = data.role === "owner" || data.role === "admin";
  const [conversations, setConversations] = useState(data.conversations);
  const [selectedId, setSelectedId] = useState<string | null>(data.conversations[0]?.id ?? null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
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
          ? "1 mensaje limpiado. El pedido se conservó"
          : `${result.data.redacted} mensajes limpiados. Los pedidos se conservaron`
      );
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
    <div className="grid h-[calc(100dvh-17rem)] min-h-[30rem] gap-3 lg:h-[calc(100dvh-14rem)] lg:max-h-[880px] lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)_19rem]">
      <Panel className={`${mobileChatOpen ? "hidden lg:flex" : "flex"} flex-col`}>
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

      <Panel className={`${mobileChatOpen ? "flex" : "hidden lg:flex"} flex-col`}>
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
