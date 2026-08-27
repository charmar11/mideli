"use client";

import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  Home,
  MapPinned,
  MessageCircleMore,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWhatsappCustomerDetailAction,
  getWhatsappCustomersAction,
  saveWhatsappCustomerAddressAction,
  updateWhatsappCustomerAction,
} from "@/lib/actions/whatsapp";
import type {
  WhatsappCustomerAddress,
  WhatsappCustomerDetail,
  WhatsappCustomerSummary,
} from "@/lib/whatsapp/admin-types";
import { whatsappOrderStatus } from "@/lib/whatsapp/inbox";

type Props = {
  onOpenConversation: (conversationId: string) => void;
};

type AddressDraft = {
  id: string | null;
  label: string;
  addressText: string;
  reference: string;
  isDefault: boolean;
};

const EMPTY_ADDRESS: AddressDraft = {
  id: null,
  label: "Casa",
  addressText: "",
  reference: "",
  isDefault: false,
};

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("52") && digits.length >= 12) {
    const local = digits.slice(-10);
    return `+52 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return digits ? `+${digits}` : "Sin teléfono";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sin compras";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Hermosillo",
  }).format(new Date(value));
}

function serviceLabel(type: string) {
  if (type === "domicilio") return "Domicilio";
  if (type === "para_llevar") return "Para llevar";
  return "Comedor";
}

function paymentLabel(status: string) {
  if (status === "paid") return "Pagado";
  if (status === "partial") return "Pago parcial";
  return "Pendiente";
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-h-0 overflow-hidden rounded-2xl border border-border bg-surface ${className}`}>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className="font-body text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-base font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div className="space-y-2 p-2" aria-label="Cargando clientes">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-24 animate-pulse rounded-xl bg-surface-raised" />
      ))}
    </div>
  );
}

function CustomerList({
  customers,
  selectedId,
  loading,
  query,
  onQuery,
  onSelect,
  onRefresh,
}: {
  customers: WhatsappCustomerSummary[];
  selectedId: string | null;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (customer: WhatsappCustomerSummary) => void;
  onRefresh: () => void;
}) {
  return (
    <Panel className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-bold">Directorio</h2>
            <p className="font-body text-xs text-muted-foreground">
              {loading ? "Actualizando…" : `${customers.length} clientes encontrados`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onRefresh} disabled={loading} aria-label="Actualizar clientes">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        <label className="relative mt-3 block">
          <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Nombre, teléfono o folio"
            className="h-11 bg-background pl-10"
          />
        </label>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-2 [content-visibility:auto]">
        {loading && customers.length === 0 ? <DirectorySkeleton /> : null}
        {!loading && customers.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground">
              <UsersRound size={21} />
            </span>
            <p className="mt-3 font-heading text-sm font-bold">No encontramos clientes</p>
            <p className="mt-1 max-w-64 font-body text-xs text-muted-foreground">
              Prueba con el nombre, los últimos dígitos del teléfono o el folio sin el signo #.
            </p>
          </div>
        ) : null}
        {customers.map((customer) => {
          const selected = customer.id === selectedId;
          return (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelect(customer)}
              className={`mb-1.5 w-full rounded-xl p-3 text-left transition-[background-color,transform] active:scale-[0.99] ${selected ? "bg-brand/15 ring-1 ring-brand/35" : "bg-background hover:bg-surface-raised"}`}
            >
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-brand text-white" : "bg-surface-raised text-muted-foreground"}`}>
                  <UserRound size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-sm font-bold">
                    {customer.displayName || "Cliente sin nombre"}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    {formatPhone(customer.phone)}
                  </span>
                </span>
                <span className="font-mono text-xs font-bold text-gold tabular-nums">
                  {formatMoney(customer.totalPaid)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 pl-[52px] font-body text-[11px] text-muted-foreground">
                <span>{customer.orderCount} {customer.orderCount === 1 ? "pedido" : "pedidos"}</span>
                <span className="truncate">{customer.lastOrderNumber ? `Último #${customer.lastOrderNumber}` : "Sin pedidos"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function AddressEditor({
  draft,
  pending,
  onChange,
  onCancel,
  onSave,
}: {
  draft: AddressDraft;
  pending: boolean;
  onChange: (draft: AddressDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label>
          <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Etiqueta</span>
          <Input value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder="Casa" className="h-11 bg-background" />
        </label>
        <label>
          <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Domicilio</span>
          <Input value={draft.addressText} onChange={(event) => onChange({ ...draft, addressText: event.target.value })} placeholder="Calle, número y colonia" className="h-11 bg-background" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Referencia</span>
        <Input value={draft.reference} onChange={(event) => onChange({ ...draft, reference: event.target.value })} placeholder="Color de casa, entre calles…" className="h-11 bg-background" />
      </label>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-background px-3">
        <input type="checkbox" checked={draft.isDefault} onChange={(event) => onChange({ ...draft, isDefault: event.target.checked })} className="h-5 w-5 accent-brand" />
        <span className="font-heading text-xs font-bold">Usar como domicilio principal</span>
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" className="h-11" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button className="h-11 bg-success text-white hover:bg-success/85" onClick={onSave} disabled={pending || draft.addressText.trim().length < 8}>
          {pending ? "Guardando…" : "Guardar domicilio"}
        </Button>
      </div>
    </div>
  );
}

function CustomerDetail({
  detail,
  loading,
  onBack,
  onRefresh,
  onOpenConversation,
}: {
  detail: WhatsappCustomerDetail | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(null);
  const [pending, startTransition] = useTransition();

  function saveName() {
    if (!detail) return;
    startTransition(async () => {
      const result = await updateWhatsappCustomerAction({
        customerId: detail.customer.id,
        displayName: nameDraft,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Nombre actualizado");
      setEditingName(false);
      onRefresh();
    });
  }

  function saveAddress() {
    if (!detail || !addressDraft) return;
    startTransition(async () => {
      const result = await saveWhatsappCustomerAddressAction({
        customerId: detail.customer.id,
        addressId: addressDraft.id,
        label: addressDraft.label,
        addressText: addressDraft.addressText,
        reference: addressDraft.reference,
        isDefault: addressDraft.isDefault,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(addressDraft.id ? "Domicilio actualizado" : "Domicilio agregado");
      setAddressDraft(null);
      onRefresh();
    });
  }

  function editAddress(address: WhatsappCustomerAddress) {
    setAddressDraft({
      id: address.id,
      label: address.label,
      addressText: address.addressText,
      reference: address.reference,
      isDefault: address.isDefault,
    });
  }

  if (loading) {
    return (
      <Panel className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <RefreshCw className="mx-auto animate-spin" size={22} />
          <p className="mt-3 font-heading text-xs font-bold">Preparando ficha…</p>
        </div>
      </Panel>
    );
  }

  if (!detail) {
    return (
      <Panel className="flex h-full items-center justify-center">
        <div className="max-w-sm px-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised text-muted-foreground">
            <UserRound size={24} />
          </span>
          <p className="mt-4 font-heading text-base font-bold">Selecciona un cliente</p>
          <p className="mt-1 font-body text-sm text-muted-foreground">Aquí aparecerán sus domicilios, pedidos y conversación.</p>
        </div>
      </Panel>
    );
  }

  const { customer, addresses, orders } = detail;
  return (
    <Panel className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" onClick={onBack} aria-label="Regresar al directorio">
          <ArrowLeft size={18} />
        </Button>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <UserRound size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="h-11 bg-background" autoFocus />
              <div className="flex gap-2">
                <Button variant="ghost" className="h-11" onClick={() => setEditingName(false)} disabled={pending}>Cancelar</Button>
                <Button className="h-11 bg-success text-white hover:bg-success/85" onClick={saveName} disabled={pending || !nameDraft.trim()}>Guardar</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg font-bold">{customer.displayName || "Cliente sin nombre"}</h2>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{formatPhone(customer.phone)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => { setNameDraft(customer.displayName); setEditingName(true); }} aria-label="Editar nombre">
                <Pencil size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Metric label="Pedidos" value={String(customer.orderCount)} />
          <Metric label="Pagados" value={String(customer.paidOrderCount)} />
          <Metric label="Total pagado" value={formatMoney(customer.totalPaid)} />
          <Metric label="Última compra" value={customer.lastOrderNumber ? `#${customer.lastOrderNumber}` : "Sin compras"} />
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {customer.lastConversationId ? (
            <Button className="h-11 gap-2 bg-success text-white hover:bg-success/85" onClick={() => onOpenConversation(customer.lastConversationId!)}>
              <MessageCircleMore size={16} />Abrir conversación
            </Button>
          ) : (
            <div className="flex min-h-11 items-center gap-2 rounded-xl bg-background px-3 font-body text-xs text-muted-foreground">
              <CircleAlert size={15} />Sin conversación disponible
            </div>
          )}
          <a href={`tel:+${customer.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 font-heading text-xs font-bold text-foreground hover:bg-surface-raised">
            <UserRound size={15} />Llamar
          </a>
        </div>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPinned size={17} className="text-brand" />
              <h3 className="font-heading text-sm font-bold">Domicilios</h3>
              <span className="font-mono text-[11px] text-muted-foreground">{addresses.length}</span>
            </div>
            {!addressDraft ? (
              <Button variant="outline" className="h-11 gap-2" onClick={() => setAddressDraft({ ...EMPTY_ADDRESS, isDefault: addresses.length === 0 })}>
                <Plus size={15} />Agregar
              </Button>
            ) : null}
          </div>
          {addressDraft ? (
            <AddressEditor draft={addressDraft} pending={pending} onChange={setAddressDraft} onCancel={() => setAddressDraft(null)} onSave={saveAddress} />
          ) : null}
          {!addressDraft && addresses.length === 0 ? (
            <div className="rounded-xl bg-background px-4 py-6 text-center">
              <Home className="mx-auto text-muted-foreground" size={20} />
              <p className="mt-2 font-body text-xs text-muted-foreground">Este cliente todavía no tiene domicilios guardados.</p>
            </div>
          ) : null}
          {!addressDraft ? (
            <div className="space-y-2">
              {addresses.map((address) => (
                <article key={address.id} className="rounded-xl bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${address.isDefault ? "bg-gold/15 text-gold" : "bg-surface-raised text-muted-foreground"}`}>
                      {address.isDefault ? <Star size={16} /> : <Home size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-xs font-bold">{address.label || "Domicilio"}</p>
                        {address.isDefault ? <span className="rounded-full bg-gold/15 px-2 py-0.5 font-heading text-[10px] font-bold text-gold">Principal</span> : null}
                        <span className={`rounded-full px-2 py-0.5 font-heading text-[10px] font-bold ${address.confirmed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                          {address.confirmed ? "Confirmado" : "Por confirmar"}
                        </span>
                      </div>
                      <p className="mt-1 font-body text-sm text-foreground">{address.addressText}</p>
                      {address.reference ? <p className="mt-1 font-body text-xs text-muted-foreground">Referencia: {address.reference}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2 font-body text-[11px] text-muted-foreground">
                        {address.deliveryFee !== null ? <span>Último envío: {formatMoney(address.deliveryFee)}</span> : null}
                        <span>Usado {formatDate(address.lastUsedAt)}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => editAddress(address)} aria-label={`Editar ${address.label || "domicilio"}`}>
                      <Pencil size={15} />
                    </Button>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.formattedAddress || address.addressText)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-heading text-xs font-bold text-brand hover:bg-brand/10"
                  >
                    <ExternalLink size={14} />Abrir en Maps
                  </a>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList size={17} className="text-brand" />
            <h3 className="font-heading text-sm font-bold">Historial de pedidos</h3>
            <span className="font-mono text-[11px] text-muted-foreground">{orders.length}</span>
          </div>
          {orders.length === 0 ? (
            <div className="rounded-xl bg-background px-4 py-6 text-center">
              <ClipboardList className="mx-auto text-muted-foreground" size={20} />
              <p className="mt-2 font-body text-xs text-muted-foreground">Todavía no hay pedidos vinculados a este cliente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => {
                const orderState = whatsappOrderStatus(order.status, order.deliveryStatus);
                return (
                  <details key={order.id} className="group rounded-xl bg-background">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised font-mono text-xs font-bold text-brand">#{order.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="font-heading text-xs">{serviceLabel(order.type)}</strong>
                          <span className="rounded-full bg-surface-raised px-2 py-0.5 font-heading text-[10px] font-bold text-muted-foreground">{orderState}</span>
                        </span>
                        <span className="mt-1 block font-body text-[11px] text-muted-foreground">{formatDate(order.createdAt)} · {paymentLabel(order.paymentStatus)} · {order.sourceChannel === "whatsapp" ? "WhatsApp" : "POS"}</span>
                      </span>
                      <strong className="font-mono text-sm text-gold tabular-nums">{formatMoney(order.total)}</strong>
                      <ChevronDown size={15} className="text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-border px-3 pb-3 pt-2">
                      {order.items.length > 0 ? (
                        <div className="space-y-1">
                          {order.items.map((item) => (
                            <p key={item.id} className="flex justify-between gap-3 font-body text-xs">
                              <span><strong className="font-mono text-brand">{item.quantity}x</strong> {item.name}{item.notes ? ` · ${item.notes}` : ""}</span>
                              <span className="shrink-0 font-mono text-muted-foreground">{formatMoney(item.unitPrice * item.quantity)}</span>
                            </p>
                          ))}
                        </div>
                      ) : <p className="font-body text-xs text-muted-foreground">Sin detalle de productos disponible.</p>}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Metric label="Pagado" value={formatMoney(order.paidAmount)} />
                        <Metric label="Envío" value={formatMoney(order.deliveryFee)} />
                      </div>
                      {order.deliveryAddress ? <p className="mt-3 font-body text-xs text-muted-foreground">📍 {order.deliveryAddress}{order.deliveryReference ? ` · ${order.deliveryReference}` : ""}</p> : null}
                      {order.channelConversationId ? (
                        <Button variant="outline" className="mt-3 h-11 gap-2" onClick={() => onOpenConversation(order.channelConversationId!)}>
                          <MessageCircleMore size={15} />Abrir chat de este pedido
                        </Button>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}

export function WhatsappCustomers({ onOpenConversation }: Props) {
  const [customers, setCustomers] = useState<WhatsappCustomerSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WhatsappCustomerDetail | null>(null);
  const [query, setQuery] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const directoryRequest = useRef(0);
  const detailRequest = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const detailCustomerIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    detailCustomerIdRef.current = detail?.customer.id ?? null;
  }, [detail?.customer.id]);

  const loadDetail = useCallback(async (customerId: string) => {
    const request = ++detailRequest.current;
    setDetailLoading(true);
    const result = await getWhatsappCustomerDetailAction(customerId);
    if (request !== detailRequest.current) return;
    setDetailLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    detailCustomerIdRef.current = result.data.customer.id;
    setDetail(result.data);
  }, []);

  const loadDirectory = useCallback(async (search: string, keepSelection = true) => {
    const request = ++directoryRequest.current;
    setListLoading(true);
    const result = await getWhatsappCustomersAction(search);
    if (request !== directoryRequest.current) return;
    setListLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCustomers(result.data.customers);
    const currentId = selectedIdRef.current;
    const currentStillVisible = keepSelection && result.data.customers.some((customer) => customer.id === currentId);
    const nextId = currentStillVisible ? currentId : result.data.customers[0]?.id ?? null;
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
    if (nextId && detailCustomerIdRef.current !== nextId) void loadDetail(nextId);
    if (!nextId) {
      detailCustomerIdRef.current = null;
      setDetail(null);
    }
  }, [loadDetail]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDirectory(query);
    }, query ? 280 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadDirectory, query]);

  function selectCustomer(customer: WhatsappCustomerSummary) {
    selectedIdRef.current = customer.id;
    setSelectedId(customer.id);
    setMobileDetail(true);
    if (detailCustomerIdRef.current !== customer.id) {
      detailCustomerIdRef.current = null;
      setDetail(null);
      void loadDetail(customer.id);
    }
  }

  function refreshSelected() {
    void loadDirectory(query);
    if (selectedId) void loadDetail(selectedId);
  }

  return (
    <div className="grid min-h-[620px] gap-3 lg:h-[calc(100dvh-13rem)] lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className={mobileDetail ? "hidden lg:block" : "block"}>
        <CustomerList
          customers={customers}
          selectedId={selectedId}
          loading={listLoading}
          query={query}
          onQuery={setQuery}
          onSelect={selectCustomer}
          onRefresh={() => void loadDirectory(query)}
        />
      </div>
      <div className={mobileDetail ? "block" : "hidden lg:block"}>
        <CustomerDetail
          key={selectedId ?? "empty-customer"}
          detail={detail}
          loading={detailLoading}
          onBack={() => setMobileDetail(false)}
          onRefresh={refreshSelected}
          onOpenConversation={onOpenConversation}
        />
      </div>
    </div>
  );
}
