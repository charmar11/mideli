"use client";

import {
  Bot,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  HandHelping,
  MapPinned,
  MessageCircleMore,
  PackageCheck,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Store,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  claimWhatsappConversationAction,
  closeWhatsappConversationAction,
  deleteWhatsappScheduleExceptionAction,
  getWhatsappConversationMessagesAction,
  getWhatsappInboxSnapshotAction,
  locateWhatsappStoreAction,
  resumeWhatsappBotAction,
  sendWhatsappHumanReplyAction,
  testWhatsappDeliveryAddressAction,
  saveWhatsappScheduleExceptionAction,
  updateWhatsappCatalogItemAction,
  updateWhatsappDeliveryRulesAction,
  updateWhatsappHoursAction,
  updateWhatsappSettingsAction,
} from "@/lib/actions/whatsapp";
import { retryWhatsappNotificationAction } from "@/lib/actions/whatsapp-order-status";
import type {
  WhatsappAdminConversation,
  WhatsappAdminMessage,
  WhatsappControlData,
} from "@/lib/whatsapp/admin-types";
import type { MenuItem, WhatsappChannelSettings } from "@/types/database";
import { WhatsAppSimulator } from "./whatsapp-simulator";

type ControlTab =
  | "overview"
  | "inbox"
  | "catalog"
  | "delivery"
  | "hours"
  | "bot"
  | "diagnostics"
  | "simulator";

const TABS: Array<{ id: ControlTab; label: string; icon: typeof Bot }> = [
  { id: "overview", label: "Resumen", icon: ShieldCheck },
  { id: "inbox", label: "Conversaciones", icon: MessageCircleMore },
  { id: "catalog", label: "Catálogo", icon: PackageCheck },
  { id: "delivery", label: "Entregas", icon: MapPinned },
  { id: "hours", label: "Horarios", icon: Clock3 },
  { id: "bot", label: "Bot", icon: Bot },
  { id: "diagnostics", label: "Diagnóstico", icon: ShieldCheck },
  { id: "simulator", label: "Simulador", icon: Settings2 },
];

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Props = {
  data: WhatsappControlData;
  menuItems: MenuItem[];
  catalogError: string | null;
  simulatorEnabled: boolean;
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
  }).format(new Date(value));
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-surface ${className}`}>{children}</section>;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-4 rounded-xl bg-background p-4 ${disabled ? "opacity-55" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-surface-raised ring-1 ring-border transition-colors peer-checked:bg-success after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-sm font-bold">{label}</span>
        <span className="mt-0.5 block font-body text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function WhatsAppControlCenter({ data, menuItems, catalogError, simulatorEnabled }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<ControlTab>("overview");
  const [isPending, startTransition] = useTransition();
  const admin = data.role === "owner" || data.role === "admin";

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="pos-scroll h-full overflow-y-auto bg-background">
      <div className="mx-auto min-h-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-5">
        <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/15 text-success">
              <MessageCircleMore aria-hidden size={21} />
            </span>
            <div>
              <h1 className="font-heading text-xl font-bold sm:text-2xl">WhatsApp</h1>
              <p className="font-body text-xs text-muted-foreground sm:text-sm">
                Pedidos, atención y entregas en un solo lugar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 font-heading text-[11px] font-bold ${data.persisted ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
              {data.persisted ? "Configuración disponible" : "Migración pendiente"}
            </span>
            <Button variant="outline" className="h-10 gap-2" onClick={refresh} disabled={isPending}>
              <RefreshCw aria-hidden size={15} className={isPending ? "animate-spin" : ""} />
              Actualizar
            </Button>
          </div>
        </header>

        {!data.persisted ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-warning">
            <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-heading text-sm font-bold">El canal permanece en modo seguro</p>
              <p className="mt-1 font-body text-xs text-warning/80">
                La configuración nueva todavía no existe en la base remota. Ningún control de esta pantalla activará pedidos reales hasta aplicar la migración aprobada.
              </p>
            </div>
          </div>
        ) : null}

        <nav className="pos-scroll mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5" aria-label="Secciones de WhatsApp">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-xs font-bold transition-colors ${tab === item.id ? "bg-brand text-white shadow-md shadow-brand/20" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}
              >
                <Icon aria-hidden size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {tab === "overview" ? <Overview data={data} onOpen={setTab} /> : null}
        {tab === "inbox" ? <Inbox data={data} onRefresh={refresh} /> : null}
        {tab === "catalog" ? <Catalog data={data} admin={admin} onRefresh={refresh} /> : null}
        {tab === "delivery" ? <Delivery data={data} admin={admin} onRefresh={refresh} /> : null}
        {tab === "hours" ? <Hours data={data} admin={admin} onRefresh={refresh} /> : null}
        {tab === "bot" ? <BotSettings data={data} admin={admin} onRefresh={refresh} /> : null}
        {tab === "diagnostics" ? <Diagnostics data={data} admin={admin} /> : null}
        {tab === "simulator" ? (
          <div className="min-h-[720px] overflow-hidden rounded-2xl border border-border">
            <WhatsAppSimulator menuItems={menuItems} catalogError={catalogError} simulatorEnabled={simulatorEnabled} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Diagnostics({ data, admin }: { data: WhatsappControlData; admin: boolean }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [storeAddress, setStoreAddress] = useState(data.settings.store_address);
  const [testAddress, setTestAddress] = useState("");
  const [deliveryResult, setDeliveryResult] = useState("");
  const checks = [
    {
      label: "Canal habilitado en el servidor",
      ready: data.diagnostics.integrationEnabled,
      detail: "Permite que el webhook acepte eventos de Meta.",
    },
    {
      label: "Proveedor de Meta listo",
      ready: data.diagnostics.providerReady,
      detail: "El número de prueba y la credencial de envío están configurados.",
    },
    {
      label: "Seguridad del webhook",
      ready: data.diagnostics.webhookSecurityReady,
      detail: "La verificación y la firma de Meta están activas.",
    },
    {
      label: "Google Maps disponible",
      ready: data.diagnostics.googleMapsReady,
      detail: "Necesario para calcular cobertura y tarifa a domicilio.",
    },
    {
      label: "Origen del local ubicado",
      ready: data.diagnostics.storeOriginReady,
      detail: "Se requiere antes de habilitar cotizaciones automáticas.",
    },
  ];
  const readyCount = checks.filter((item) => item.ready).length;
  function retryNotification(id: string) {
    startRetry(async () => {
      const result = await retryWhatsappNotificationAction(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Notificación reenviada");
      router.refresh();
    });
  }
  function locateStore() {
    startRetry(async () => {
      const result = await locateWhatsappStoreAction(storeAddress);
      if (!result.success) { toast.error(result.error); return; }
      setStoreAddress(result.data.formattedAddress);
      toast.success("Origen del local ubicado y guardado");
      router.refresh();
    });
  }
  function testDelivery() {
    startRetry(async () => {
      setDeliveryResult("");
      const result = await testWhatsappDeliveryAddressAction(testAddress);
      if (!result.success) { toast.error(result.error); return; }
      if (result.data.status === "needs_handoff") {
        setDeliveryResult("La dirección requiere revisión manual por cobertura o configuración.");
        return;
      }
      setDeliveryResult(`${result.data.distanceKm} km · Envío $${result.data.totalFee} · ${result.data.formattedAddress}`);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Panel>
        <div className="border-b border-border p-4">
          <h2 className="font-heading text-lg font-bold">Estado técnico del canal</h2>
          <p className="font-body text-xs text-muted-foreground">
            Muestra únicamente si cada pieza está configurada. Nunca expone claves privadas.
          </p>
        </div>
        <div className="divide-y divide-border">
          {checks.map((check) => (
            <div key={check.label} className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${check.ready ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                {check.ready ? <Check size={16} /> : <CircleAlert size={16} />}
              </span>
              <div>
                <p className="font-heading text-sm font-bold">{check.label}</p>
                <p className="mt-1 font-body text-xs text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel className="p-5">
          <p className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">Preparación</p>
          <p className="mt-2 font-data text-4xl font-bold text-brand">{readyCount}/{checks.length}</p>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            {readyCount === checks.length ? "La infraestructura está lista para una prueba completa." : "Completa los puntos marcados antes de habilitar pedidos reales."}
          </p>
        </Panel>
        <Panel className="p-5">
          <h3 className="font-heading text-sm font-bold">Modo actual</h3>
          <dl className="mt-3 space-y-2 font-body text-xs">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Ejecución</dt><dd className="font-bold">{data.diagnostics.dryRun ? "Prueba sin persistencia" : "Persistente"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Teléfonos limitados</dt><dd className="font-data font-bold">{data.diagnostics.allowedTestPhones || "No"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pedidos reales</dt><dd className={`font-bold ${data.diagnostics.orderCreationEnabled ? "text-success" : "text-warning"}`}>{data.diagnostics.orderCreationEnabled ? "Habilitados" : "Bloqueados"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cotización automática</dt><dd className={`font-bold ${data.settings.delivery_quotes_enabled ? "text-success" : "text-warning"}`}>{data.settings.delivery_quotes_enabled ? "Habilitada" : "Desactivada"}</dd></div>
          </dl>
        </Panel>
        <Panel>
          <div className="border-b border-border p-4"><h3 className="font-heading text-sm font-bold">Notificaciones con error</h3><p className="font-body text-xs text-muted-foreground">Puedes reenviarlas sin duplicar el evento del pedido.</p></div>
          {data.diagnostics.failedNotifications.length === 0 ? <p className="p-5 font-body text-sm text-muted-foreground">No hay notificaciones pendientes.</p> : <div className="divide-y divide-border">{data.diagnostics.failedNotifications.map((item) => <div key={item.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-heading text-sm font-bold">Pedido #{item.orderNumber || "?"}</p><p className="font-body text-xs text-muted-foreground">{item.eventKey} · {item.attempts} intentos</p>{item.lastError ? <p className="mt-1 line-clamp-2 font-body text-[11px] text-danger">{item.lastError}</p> : null}</div><Button variant="outline" className="h-9 gap-2" disabled={retrying} onClick={() => retryNotification(item.id)}><RefreshCw size={14} />Reintentar</Button></div>)}</div>}
        </Panel>
        <Panel className="p-5">
          <h3 className="font-heading text-sm font-bold">Probar entregas sin crear pedidos</h3>
          <p className="mt-1 font-body text-xs text-muted-foreground">Primero ubica el local. Después prueba un domicilio real para revisar distancia y tarifa.</p>
          <label className="mt-4 block"><span className="mb-1.5 block font-heading text-[11px] font-bold">Dirección del local</span><div className="flex gap-2"><Input value={storeAddress} disabled={!admin} onChange={(event) => setStoreAddress(event.target.value)} placeholder="Dirección completa de Mideli" className="h-11" /><Button variant="outline" className="h-11 shrink-0" disabled={!admin || retrying || storeAddress.trim().length < 8} onClick={locateStore}><MapPinned size={15} /><span className="sr-only sm:not-sr-only sm:ml-2">Ubicar</span></Button></div></label>
          <label className="mt-3 block"><span className="mb-1.5 block font-heading text-[11px] font-bold">Domicilio de prueba</span><div className="flex gap-2"><Input value={testAddress} disabled={!admin} onChange={(event) => setTestAddress(event.target.value)} placeholder="Calle, número y colonia" className="h-11" /><Button className="h-11 shrink-0 bg-success text-white hover:bg-success/85" disabled={!admin || retrying || testAddress.trim().length < 8} onClick={testDelivery}>Calcular</Button></div></label>
          {deliveryResult ? <p className="mt-3 rounded-xl bg-success/10 p-3 font-body text-xs text-success">{deliveryResult}</p> : null}
        </Panel>
      </div>
    </div>
  );
}

function Overview({ data, onOpen }: { data: WhatsappControlData; onOpen: (tab: ControlTab) => void }) {
  const metrics = [
    { label: "Conversaciones activas", value: data.metrics.active, icon: MessageCircleMore, tone: "text-success bg-success/15" },
    { label: "Esperando al equipo", value: data.metrics.handoff, icon: HandHelping, tone: "text-warning bg-warning/15" },
    { label: "Pedidos confirmados hoy", value: data.metrics.confirmedToday, icon: PackageCheck, tone: "text-brand bg-brand/15" },
    { label: "Mensajes con error", value: data.metrics.failedMessages, icon: CircleAlert, tone: "text-danger bg-danger/15" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Panel key={metric.label} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${metric.tone}`}><Icon size={18} /></span>
                <strong className="font-data text-3xl tabular-nums">{metric.value}</strong>
              </div>
              <p className="mt-4 font-heading text-sm font-bold">{metric.label}</p>
            </Panel>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel className="p-5">
          <h2 className="font-heading text-lg font-bold">Estado del canal</h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">Los controles críticos se pueden detener por separado.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ["Recibir mensajes", data.settings.receive_enabled],
              ["Responder automáticamente", data.settings.auto_reply_enabled],
              ["Crear pedidos", data.settings.create_orders_enabled],
              ["Cotizar domicilios", data.settings.delivery_quotes_enabled],
              ["Avisar estados", data.settings.status_notifications_enabled],
              ["Atención humana", data.settings.human_handoff_enabled],
            ].map(([label, active]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-xl bg-background px-4 py-3">
                <span className="font-body text-sm">{label}</span>
                <span className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${active ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                  {active ? "ACTIVO" : "PAUSADO"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="font-heading text-lg font-bold">Atención inmediata</h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">Abre lo que requiere revisión del equipo.</p>
          <button type="button" onClick={() => onOpen("inbox")} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-warning/10 p-4 text-left text-warning hover:bg-warning/15">
            <HandHelping size={20} />
            <span className="min-w-0 flex-1"><strong className="block font-heading text-sm">{data.metrics.handoff} conversaciones</strong><span className="font-body text-xs text-warning/75">Esperan respuesta de una persona</span></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => onOpen("catalog")} className="mt-2 flex w-full items-center gap-3 rounded-xl bg-background p-4 text-left hover:bg-surface-raised">
            <PackageCheck size={20} className="text-brand" />
            <span className="min-w-0 flex-1"><strong className="block font-heading text-sm">Catálogo del canal</strong><span className="font-body text-xs text-muted-foreground">{data.catalog.filter((item) => item.whatsappEnabled && item.isActive).length} productos disponibles</span></span>
            <ChevronRight size={18} />
          </button>
        </Panel>
      </div>
    </div>
  );
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
      && item.lastMessage === candidate.lastMessage;
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

function Inbox({ data }: { data: WhatsappControlData; onRefresh: () => void }) {
  const [conversations, setConversations] = useState(data.conversations);
  const [selectedId, setSelectedId] = useState<string | null>(data.conversations[0]?.id ?? null);
  const effectiveSelectedId = conversations.some((conversation) => conversation.id === selectedId)
    ? selectedId
    : conversations[0]?.id ?? null;
  const selected = conversations.find((conversation) => conversation.id === effectiveSelectedId)
    ?? conversations[0]
    ?? null;
  const [messages, setMessages] = useState<WhatsappAdminMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const loading = Boolean(effectiveSelectedId && loadedConversationId !== effectiveSelectedId);
  const [pending, startTransition] = useTransition();
  const selectedIdRef = useRef(effectiveSelectedId);
  const syncingRef = useRef(false);
  const messageViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedIdRef.current = effectiveSelectedId;
  }, [effectiveSelectedId]);

  useEffect(() => {
    if (!effectiveSelectedId) return;
    let active = true;
    void getWhatsappConversationMessagesAction(effectiveSelectedId).then((result) => {
      if (!active) return;
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setMessages((current) => sameMessages(current, result.data) ? current : result.data);
      setLoadedConversationId(effectiveSelectedId);
    });
    return () => {
      active = false;
    };
  }, [effectiveSelectedId]);

  const syncInbox = useCallback(async () => {
    if (syncingRef.current || document.visibilityState !== "visible") return;
    syncingRef.current = true;
    const requestedConversationId = selectedIdRef.current;
    try {
      const result = await getWhatsappInboxSnapshotAction(requestedConversationId);
      if (!result.success) return;
      setConversations((current) =>
        sameConversations(current, result.data.conversations)
          ? current
          : result.data.conversations
      );
      if (result.data.conversationId === selectedIdRef.current) {
        setMessages((current) =>
          sameMessages(current, result.data.messages) ? current : result.data.messages
        );
        setLoadedConversationId(result.data.conversationId);
      }
    } catch {
      // Conserva la última bandeja útil y vuelve a intentar en el siguiente ciclo.
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => void syncInbox(), 2_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncInbox();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncInbox]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport || loading) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [effectiveSelectedId, loading, messages]);

  function openConversation(conversation: WhatsappAdminConversation) {
    setMessages([]);
    setSelectedId(conversation.id);
  }

  function run(action: () => Promise<{ success: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "No se pudo completar");
        return;
      }
      toast.success(success);
      void syncInbox();
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
      const refreshed = await getWhatsappConversationMessagesAction(selected.id);
      if (refreshed.success) setMessages(refreshed.data);
      toast.success("Mensaje enviado");
      void syncInbox();
    });
  }

  return (
    <div className="grid min-h-[650px] gap-4 lg:grid-cols-[22rem_1fr]">
      <Panel className="min-h-0 overflow-hidden">
        <div className="border-b border-border p-4"><h2 className="font-heading text-base font-bold">Conversaciones recientes</h2><p className="font-body text-xs text-muted-foreground">Toma el control cuando el bot necesite ayuda.</p></div>
        <div className="pos-scroll max-h-[650px] overflow-y-auto p-2">
          {conversations.length === 0 ? <p className="p-8 text-center font-body text-sm text-muted-foreground">Todavía no hay conversaciones.</p> : conversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className={`mb-1 w-full rounded-xl p-3 text-left transition-colors ${selected?.id === conversation.id ? "bg-brand/15 ring-1 ring-brand/30" : "hover:bg-background"}`}>
              <div className="flex items-center justify-between gap-2"><strong className="font-heading text-sm">{formatPhone(conversation.phone)}</strong><span className={`rounded-full px-2 py-0.5 font-heading text-[10px] font-bold ${conversation.status === "handoff" ? "bg-warning/15 text-warning" : conversation.status === "active" ? "bg-success/15 text-success" : "bg-surface-raised text-muted-foreground"}`}>{conversation.status === "handoff" ? "ATENCIÓN" : conversation.status.toUpperCase()}</span></div>
              <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">{conversation.lastMessage}</p>
              <p className="mt-2 font-data text-[10px] text-muted-foreground">{formatDate(conversation.updatedAt)}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="flex min-h-[650px] flex-col overflow-hidden">
        {!selected ? <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground"><div><MessageCircleMore className="mx-auto mb-3" size={28} /><p className="font-heading text-sm font-bold">Selecciona una conversación</p></div></div> : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
              <div className="min-w-0 flex-1"><h2 className="font-heading text-base font-bold">{formatPhone(selected.phone)}</h2><p className="font-body text-xs text-muted-foreground">{selected.botEnabled ? "El bot está respondiendo" : "Atención manual activa"}</p></div>
              {selected.botEnabled ? <Button variant="outline" className="h-9 gap-2" disabled={pending} onClick={() => run(() => claimWhatsappConversationAction(selected.id), "Conversación asignada")}><UserRoundCheck size={14} />Tomar</Button> : <Button variant="outline" className="h-9 gap-2" disabled={pending} onClick={() => run(() => resumeWhatsappBotAction(selected.id), "Bot reactivado")}><Bot size={14} />Devolver al bot</Button>}
              <Button variant="ghost" className="h-9" disabled={pending} onClick={() => run(() => closeWhatsappConversationAction(selected.id), "Conversación cerrada")}>Cerrar</Button>
            </div>
            <div className="grid gap-2 border-b border-border bg-surface-raised/35 p-3 sm:grid-cols-3">
              <div className="rounded-xl bg-background px-3 py-2 sm:col-span-2">
                <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pedido actual</p>
                <p className="mt-1 font-body text-xs text-foreground">
                  {selected.context.items.length > 0
                    ? selected.context.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")
                    : "Todavía no hay productos en el carrito"}
                </p>
              </div>
              <div className="rounded-xl bg-background px-3 py-2">
                <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="mt-1 font-data text-base font-bold text-brand">${selected.context.total}</p>
              </div>
              <div className="rounded-xl bg-background px-3 py-2">
                <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Entrega</p>
                <p className="mt-1 font-body text-xs">{selected.context.serviceType === "domicilio" ? "A domicilio" : selected.context.serviceType === "para_llevar" ? "Para recoger" : "Por definir"}</p>
              </div>
              <div className="rounded-xl bg-background px-3 py-2 sm:col-span-2">
                <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Domicilio y pago</p>
                <p className="mt-1 font-body text-xs">{selected.context.address || "Domicilio pendiente"}{selected.context.addressReference ? ` · ${selected.context.addressReference}` : ""}{selected.context.paymentMethod ? ` · ${selected.context.paymentMethod}` : ""}</p>
              </div>
            </div>
            <div ref={messageViewportRef} className="pos-scroll flex-1 space-y-3 overflow-y-auto bg-background/55 p-4">
              {loading ? <p className="text-center font-body text-sm text-muted-foreground">Cargando mensajes...</p> : messages.length === 0 ? <p className="text-center font-body text-sm text-muted-foreground">Esta conversación todavía no tiene mensajes visibles.</p> : messages.map((item) => (
                <div key={item.id} className={`flex ${item.direction === "outbound" ? "justify-end" : "justify-start"}`}><div className={`max-w-[84%] rounded-2xl px-4 py-3 ${item.direction === "outbound" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-surface text-foreground ring-1 ring-border"}`}><p className="whitespace-pre-wrap font-body text-sm">{item.body || "Contenido eliminado por retención"}</p><p className={`mt-1 font-data text-[10px] ${item.direction === "outbound" ? "text-white/65" : "text-muted-foreground"}`}>{item.status} · {formatDate(item.occurredAt)}</p></div></div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-border p-3"><Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendReply(); } }} placeholder="Escribe una respuesta..." className="h-11" /><Button className="h-11 gap-2 bg-success text-white hover:bg-success/85" disabled={pending || !draft.trim()} onClick={sendReply}><Send size={15} />Enviar</Button></div>
          </>
        )}
      </Panel>
    </div>
  );
}

function Catalog({ data, admin, onRefresh }: { data: WhatsappControlData; admin: boolean; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(() => data.catalog.filter((item) => `${item.name} ${item.categoryName}`.toLowerCase().includes(query.toLowerCase())), [data.catalog, query]);
  function toggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await updateWhatsappCatalogItemAction(id, enabled);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(enabled ? "Producto visible en WhatsApp" : "Producto oculto de WhatsApp");
      onRefresh();
    });
  }
  return <Panel><div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-lg font-bold">Catálogo de WhatsApp</h2><p className="font-body text-xs text-muted-foreground">Ocultar aquí no elimina el producto del POS.</p></div><label className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" className="h-11 pl-10" /></label></div><div className="divide-y divide-border">{filtered.map((item) => <div key={item.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-heading text-sm font-bold">{item.name}</p><p className="font-body text-xs text-muted-foreground">{item.categoryName}{!item.isActive ? " · Inactivo en el menú" : ""}</p></div><label className={`flex items-center gap-2 font-heading text-xs ${admin && item.isActive ? "cursor-pointer" : "opacity-50"}`}><input type="checkbox" checked={item.whatsappEnabled && item.isActive} disabled={!admin || !item.isActive || pending} onChange={(event) => toggle(item.id, event.target.checked)} className="h-5 w-5 accent-brand" />{item.whatsappEnabled && item.isActive ? "Disponible" : "Oculto"}</label></div>)}</div></Panel>;
}

function Delivery({ data, admin, onRefresh }: { data: WhatsappControlData; admin: boolean; onRefresh: () => void }) {
  const [rates, setRates] = useState(() => data.rates.map((item) => ({ id: item.id, minDistanceKm: Number(item.min_distance_km), maxDistanceKm: Number(item.max_distance_km), fee: Number(item.fee) })));
  const [surcharges, setSurcharges] = useState(() => data.surcharges.map((item) => ({ id: item.id, name: item.colony_name, fee: Number(item.fee), isActive: item.is_active })));
  const [pending, startTransition] = useTransition();
  function save() { startTransition(async () => { const result = await updateWhatsappDeliveryRulesAction({ rates, surcharges }); if (!result.success) { toast.error(result.error); return; } toast.success("Tarifas de entrega guardadas"); onRefresh(); }); }
  return <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]"><Panel><div className="border-b border-border p-4"><h2 className="font-heading text-lg font-bold">Tarifa por distancia</h2><p className="font-body text-xs text-muted-foreground">Más de 15 km se transfiere automáticamente a una persona.</p></div><div className="divide-y divide-border">{rates.map((rate, index) => <div key={rate.id} className="grid grid-cols-[1fr_auto] items-center gap-3 p-3 sm:grid-cols-[1fr_1fr_1fr]"><span className="font-body text-sm">{rate.minDistanceKm === 0 ? "Desde 0" : `Más de ${rate.minDistanceKm}`} a {rate.maxDistanceKm} km</span><span className="hidden font-body text-xs text-muted-foreground sm:block">Costo base</span><label className="flex items-center gap-2"><span className="font-data text-sm">$</span><Input type="number" min="0" value={rate.fee} disabled={!admin} onChange={(event) => setRates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fee: Number(event.target.value) } : item))} className="h-10 w-24" /></label></div>)}</div></Panel><Panel><div className="border-b border-border p-4"><h2 className="font-heading text-lg font-bold">Recargos por colonia</h2><p className="font-body text-xs text-muted-foreground">Se suman a la tarifa calculada por kilómetros.</p></div><div className="divide-y divide-border">{surcharges.map((item, index) => <div key={item.id} className="flex items-center gap-3 p-3"><input type="checkbox" checked={item.isActive} disabled={!admin} onChange={(event) => setSurcharges((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, isActive: event.target.checked } : row))} className="h-5 w-5 accent-brand" /><span className="min-w-0 flex-1 font-heading text-sm">{item.name}</span><span className="font-data text-sm">+$</span><Input type="number" min="0" value={item.fee} disabled={!admin} onChange={(event) => setSurcharges((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, fee: Number(event.target.value) } : row))} className="h-10 w-20" /></div>)}</div></Panel>{admin ? <div className="xl:col-span-2 flex justify-end"><Button className="h-11 gap-2 bg-success text-white hover:bg-success/85" disabled={pending || !data.persisted} onClick={save}><Save size={15} />Guardar tarifas</Button></div> : null}</div>;
}

function Hours({ data, admin, onRefresh }: { data: WhatsappControlData; admin: boolean; onRefresh: () => void }) {
  const [hours, setHours] = useState(() => data.hours.map((item) => ({ dayOfWeek: item.day_of_week, isOpen: item.is_open, opensAt: item.opens_at.slice(0, 5), closesAt: item.closes_at.slice(0, 5) })).sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7)));
  const [exception, setException] = useState({ serviceDate: "", isOpen: false, opensAt: "12:00", closesAt: "23:00", note: "" });
  const [pending, startTransition] = useTransition();
  function save() { startTransition(async () => { const result = await updateWhatsappHoursAction(hours); if (!result.success) { toast.error(result.error); return; } toast.success("Horario guardado"); onRefresh(); }); }
  function saveException() {
    startTransition(async () => {
      const result = await saveWhatsappScheduleExceptionAction({
        serviceDate: exception.serviceDate,
        isOpen: exception.isOpen,
        opensAt: exception.isOpen ? exception.opensAt : null,
        closesAt: exception.isOpen ? exception.closesAt : null,
        note: exception.note,
      });
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Fecha especial guardada");
      setException({ serviceDate: "", isOpen: false, opensAt: "12:00", closesAt: "23:00", note: "" });
      onRefresh();
    });
  }
  function removeException(id: string) {
    startTransition(async () => {
      const result = await deleteWhatsappScheduleExceptionAction(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Fecha especial eliminada");
      onRefresh();
    });
  }
  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel>
        <div className="border-b border-border p-4"><h2 className="font-heading text-lg font-bold">Horario semanal</h2><p className="font-body text-xs text-muted-foreground">Fuera de horario el bot avisa y no toma pedidos.</p></div>
        <div className="divide-y divide-border">{hours.map((item, index) => <div key={item.dayOfWeek} className="grid items-center gap-3 p-4 sm:grid-cols-[9rem_7rem_1fr]"><strong className="font-heading text-sm">{DAY_NAMES[item.dayOfWeek]}</strong><label className="flex items-center gap-2 font-body text-xs"><input type="checkbox" checked={item.isOpen} disabled={!admin} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, isOpen: event.target.checked } : row))} className="h-5 w-5 accent-brand" />{item.isOpen ? "Abierto" : "Cerrado"}</label><div className="flex items-center gap-2"><Input type="time" value={item.opensAt} disabled={!admin || !item.isOpen} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, opensAt: event.target.value } : row))} className="h-10" /><span className="text-muted-foreground">a</span><Input type="time" value={item.closesAt} disabled={!admin || !item.isOpen} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, closesAt: event.target.value } : row))} className="h-10" /></div></div>)}</div>
        {admin ? <div className="flex justify-end border-t border-border p-4"><Button className="h-11 gap-2 bg-success text-white hover:bg-success/85" disabled={pending || !data.persisted} onClick={save}><Save size={15} />Guardar horario</Button></div> : null}
      </Panel>
      <div className="space-y-4">
        <Panel className="p-4">
          <div className="flex items-center gap-2"><CalendarPlus size={18} className="text-brand" /><h2 className="font-heading text-base font-bold">Fecha especial</h2></div>
          <p className="mt-1 font-body text-xs text-muted-foreground">Cierra por vacaciones o usa un horario diferente solo ese día.</p>
          <Input type="date" value={exception.serviceDate} disabled={!admin} onChange={(event) => setException((current) => ({ ...current, serviceDate: event.target.value }))} className="mt-4 h-11" />
          <label className="mt-3 flex items-center gap-2 font-body text-sm"><input type="checkbox" checked={exception.isOpen} disabled={!admin} onChange={(event) => setException((current) => ({ ...current, isOpen: event.target.checked }))} className="h-5 w-5 accent-brand" />Abrir con horario especial</label>
          {exception.isOpen ? <div className="mt-3 flex items-center gap-2"><Input type="time" value={exception.opensAt} disabled={!admin} onChange={(event) => setException((current) => ({ ...current, opensAt: event.target.value }))} /><span className="text-muted-foreground">a</span><Input type="time" value={exception.closesAt} disabled={!admin} onChange={(event) => setException((current) => ({ ...current, closesAt: event.target.value }))} /></div> : null}
          <Input value={exception.note} disabled={!admin} onChange={(event) => setException((current) => ({ ...current, note: event.target.value }))} placeholder="Motivo, por ejemplo vacaciones" className="mt-3 h-11" />
          {admin ? <Button className="mt-3 h-11 w-full gap-2 bg-success text-white hover:bg-success/85" disabled={pending || !exception.serviceDate} onClick={saveException}><Check size={15} />Guardar fecha</Button> : null}
        </Panel>
        <Panel>
          <div className="border-b border-border p-4"><h3 className="font-heading text-sm font-bold">Próximas excepciones</h3></div>
          {data.scheduleExceptions.length === 0 ? <p className="p-5 font-body text-sm text-muted-foreground">No hay fechas especiales programadas.</p> : <div className="divide-y divide-border">{data.scheduleExceptions.map((item) => <div key={item.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-heading text-sm font-bold">{item.serviceDate}</p><p className="font-body text-xs text-muted-foreground">{item.isOpen ? `${item.opensAt?.slice(0, 5)} a ${item.closesAt?.slice(0, 5)}` : "Cerrado"}{item.note ? ` · ${item.note}` : ""}</p></div>{admin ? <Button variant="ghost" size="icon" className="text-danger hover:bg-danger/10 hover:text-danger" disabled={pending} onClick={() => removeException(item.id)}><Trash2 size={15} /><span className="sr-only">Eliminar excepción</span></Button> : null}</div>)}</div>}
        </Panel>
      </div>
    </div>
  );
}

function BotSettings({ data, admin, onRefresh }: { data: WhatsappControlData; admin: boolean; onRefresh: () => void }) {
  const [settings, setSettings] = useState(() => ({ ...data.settings }));
  const [pending, startTransition] = useTransition();
  function boolean<K extends keyof WhatsappChannelSettings>(key: K, value: boolean) { setSettings((current) => ({ ...current, [key]: value })); }
  function save() { startTransition(async () => { const result = await updateWhatsappSettingsAction({ receive_enabled: settings.receive_enabled, auto_reply_enabled: settings.auto_reply_enabled, create_orders_enabled: settings.create_orders_enabled, delivery_quotes_enabled: settings.delivery_quotes_enabled, status_notifications_enabled: settings.status_notifications_enabled, human_handoff_enabled: settings.human_handoff_enabled, message_retention_days: Number(settings.message_retention_days), store_address: settings.store_address, store_latitude: settings.store_latitude === null ? null : Number(settings.store_latitude), store_longitude: settings.store_longitude === null ? null : Number(settings.store_longitude), closed_message: settings.closed_message }); if (!result.success) { toast.error(result.error); return; } toast.success("Configuración de WhatsApp guardada"); onRefresh(); }); }
  return <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]"><Panel className="p-4"><h2 className="mb-4 font-heading text-lg font-bold">Operación del bot</h2><div className="space-y-2"><Toggle checked={settings.receive_enabled} onChange={(value) => boolean("receive_enabled", value)} label="Recibir mensajes" description="Interruptor principal del canal." disabled={!admin} /><Toggle checked={settings.auto_reply_enabled} onChange={(value) => boolean("auto_reply_enabled", value)} label="Responder automáticamente" description="El bot guía el pedido usando el menú real." disabled={!admin} /><Toggle checked={settings.create_orders_enabled} onChange={(value) => boolean("create_orders_enabled", value)} label="Crear pedidos en Mideli" description="Solo después de la confirmación final del cliente." disabled={!admin} /><Toggle checked={settings.delivery_quotes_enabled} onChange={(value) => boolean("delivery_quotes_enabled", value)} label="Cotizar domicilios" description="Usa Google Maps, rangos y recargos configurados." disabled={!admin} /><Toggle checked={settings.status_notifications_enabled} onChange={(value) => boolean("status_notifications_enabled", value)} label="Notificar avance" description="Preparación, listo y repartidor en camino." disabled={!admin} /><Toggle checked={settings.human_handoff_enabled} onChange={(value) => boolean("human_handoff_enabled", value)} label="Permitir atención humana" description="Detiene el bot cuando un cliente necesita ayuda." disabled={!admin} /></div></Panel><div className="space-y-4"><Panel className="p-4"><div className="flex items-center gap-2"><Store size={18} className="text-brand" /><h2 className="font-heading text-base font-bold">Origen de las entregas</h2></div><label className="mt-4 block"><span className="mb-1.5 block font-heading text-xs font-bold">Dirección del local</span><Input value={settings.store_address} disabled={!admin} onChange={(event) => setSettings((current) => ({ ...current, store_address: event.target.value }))} placeholder="Dirección completa de Mideli" /></label><div className="mt-3 grid grid-cols-2 gap-2"><label><span className="mb-1.5 block font-heading text-xs font-bold">Latitud</span><Input type="number" step="any" value={settings.store_latitude ?? ""} disabled={!admin} onChange={(event) => setSettings((current) => ({ ...current, store_latitude: event.target.value ? Number(event.target.value) : null }))} /></label><label><span className="mb-1.5 block font-heading text-xs font-bold">Longitud</span><Input type="number" step="any" value={settings.store_longitude ?? ""} disabled={!admin} onChange={(event) => setSettings((current) => ({ ...current, store_longitude: event.target.value ? Number(event.target.value) : null }))} /></label></div><a href="https://maps.google.com" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-body text-xs text-brand hover:underline">Abrir Google Maps <ExternalLink size={12} /></a></Panel><Panel className="p-4"><label className="block"><span className="mb-1.5 block font-heading text-xs font-bold">Mensaje fuera de horario</span><textarea value={settings.closed_message} disabled={!admin} onChange={(event) => setSettings((current) => ({ ...current, closed_message: event.target.value }))} rows={4} className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 font-body text-sm outline-none focus:border-brand" /></label><label className="mt-3 block"><span className="mb-1.5 block font-heading text-xs font-bold">Retención de mensajes</span><div className="flex items-center gap-2"><Input type="number" min="7" max="365" value={settings.message_retention_days} disabled={!admin} onChange={(event) => setSettings((current) => ({ ...current, message_retention_days: Number(event.target.value) }))} className="w-28" /><span className="font-body text-xs text-muted-foreground">días</span></div></label></Panel>{admin ? <Button className="h-11 w-full gap-2 bg-success text-white hover:bg-success/85" disabled={pending || !data.persisted} onClick={save}><Check size={16} />Guardar configuración</Button> : null}</div></div>;
}
