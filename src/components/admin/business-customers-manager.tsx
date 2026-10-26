"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  createBusinessCustomerAddressAction,
  deleteBusinessCustomerAddressAction,
  getBusinessCustomerDetailsAction,
  listBusinessCustomersAction,
} from "@/lib/actions/business-customers";
import { formatPhoneForDisplay } from "@/lib/phone";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import {
  getBusinessCustomerPaymentLabel,
  getBusinessCustomerOrderStatusLabel,
  getBusinessCustomerOrderTotal,
} from "@/lib/business-customer-presentation";
import { useBusinessContextStore } from "@/lib/stores/business-context-store";
import type {
  BusinessCustomerDetails,
  BusinessCustomerDirectoryRow,
} from "@/types/business-customers";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
}

function orderTypeLabel(type: string) {
  if (type === "domicilio") return "Domicilio";
  if (type === "para_llevar") return "Para llevar";
  return "Comedor";
}

export function BusinessCustomersManager() {
  const businesses = useBusinessContextStore((state) => state.businesses);
  const selectedBusinessId = useBusinessContextStore((state) => state.selectedBusinessId);
  const businessName = businesses.find((business) => business.business_id === selectedBusinessId)
    ?.business_display_name ?? "Negocio";
  const [customers, setCustomers] = useState<BusinessCustomerDirectoryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsState, setDetailsState] = useState<{
    customerId: string;
    value: BusinessCustomerDetails;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [addressLabel, setAddressLabel] = useState("Casa");
  const [addressText, setAddressText] = useState("");
  const [addressColony, setAddressColony] = useState("");
  const [addressReference, setAddressReference] = useState("");
  const [addressSavePending, setAddressSavePending] = useState(false);
  const [addressDeleteConfirmId, setAddressDeleteConfirmId] = useState<string | null>(null);
  const [addressDeletePendingId, setAddressDeletePendingId] = useState<string | null>(null);
  const [detailsRefreshVersion, setDetailsRefreshVersion] = useState(0);
  const latestListRequest = useRef(0);
  const details = detailsState?.customerId === selectedId ? detailsState.value : null;
  const detailsLoading = detailsLoadingId === selectedId;

  const loadCustomers = useCallback(async (term: string, quiet = false) => {
    const requestId = ++latestListRequest.current;
    if (!quiet) setLoading(true);
    try {
      const result = await listBusinessCustomersAction(term);
      if (requestId !== latestListRequest.current) return;
      if (!result.success) {
        toast.error(result.error ?? "No se pudo cargar el directorio");
        setCustomers([]);
        setDetailsState(null);
        setSelectedId(null);
      } else {
        setCustomers(result.data);
        setSelectedId((current) =>
          current && result.data.some((customer) => customer.id === current) ? current : null
        );
      }
    } catch {
      if (requestId === latestListRequest.current) {
        toast.error("No se pudo cargar el directorio");
        setCustomers([]);
        setDetailsState(null);
        setSelectedId(null);
      }
    } finally {
      if (requestId === latestListRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const refreshCustomerData = useCallback(async () => {
    setRefreshing(true);
    setDetailsRefreshVersion((version) => version + 1);
    await loadCustomers(search, true);
  }, [loadCustomers, search]);
  const pullToRefreshRef = usePullToRefresh<HTMLElement>(
    refreshCustomerData,
    !loading && !refreshing,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCustomers(search), 220);
    return () => window.clearTimeout(timer);
  }, [loadCustomers, search]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    void getBusinessCustomerDetailsAction(selectedId).then((result) => {
      if (cancelled) return;
      setDetailsLoadingId((current) => current === selectedId ? null : current);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "No se pudo abrir el cliente");
        setDetailsState(null);
        return;
      }
      setDetailsState({ customerId: selectedId, value: result.data });
    }).catch(() => {
      if (cancelled) return;
      setDetailsLoadingId((current) => current === selectedId ? null : current);
      setDetailsState(null);
      toast.error("No se pudo abrir el cliente");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, detailsRefreshVersion]);

  async function handleCreateAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details || addressSavePending) return;
    setAddressSavePending(true);
    let result: Awaited<ReturnType<typeof createBusinessCustomerAddressAction>>;
    try {
      result = await createBusinessCustomerAddressAction({
        customerId: details.id,
        label: addressLabel,
        addressText,
        colony: addressColony,
        reference: addressReference,
      });
    } catch {
      toast.error("No se pudo guardar el domicilio");
      return;
    } finally {
      setAddressSavePending(false);
    }
    if (!result.success) {
      toast.error(result.error ?? "No se pudo guardar el domicilio");
      return;
    }
    toast.success("Domicilio guardado");
    setAddressFormOpen(false);
    setAddressLabel("Casa");
    setAddressText("");
    setAddressColony("");
    setAddressReference("");
    setDetailsRefreshVersion((version) => version + 1);
    void loadCustomers(search, true);
  }

  async function handleDeleteAddress(addressId: string) {
    if (!details || addressDeletePendingId) return;
    setAddressDeletePendingId(addressId);
    let result: Awaited<ReturnType<typeof deleteBusinessCustomerAddressAction>>;
    try {
      result = await deleteBusinessCustomerAddressAction({
        customerId: details.id,
        addressId,
      });
    } catch {
      toast.error("No se pudo eliminar el domicilio");
      return;
    } finally {
      setAddressDeletePendingId(null);
    }
    setAddressDeleteConfirmId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo eliminar el domicilio");
      return;
    }
    if (!result.data.defaultAddressSet) {
      toast.warning("Domicilio eliminado. Los demás seguirán disponibles y se ordenarán por uso reciente.");
    } else {
      toast.success("Domicilio eliminado");
    }
    setDetailsRefreshVersion((version) => version + 1);
    void loadCustomers(search, true);
  }

  return (
    <div className="mideli-settings-screen flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 shadow-sm sm:px-6">
        <Link
          href="/dashboard"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          aria-label="Volver al sistema"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <UsersRound size={19} />
        </span>
        <div className="min-w-0">
          <p className="font-heading text-lg font-bold text-foreground">Clientes</p>
          <p className="flex items-center gap-1 truncate font-body text-xs text-muted-foreground">
            <Building2 size={12} /> {businessName}
          </p>
        </div>
      </header>

      <main ref={pullToRefreshRef} className="mideli-page-scroll flex-1 overflow-y-auto p-3 sm:p-5 lg:p-7">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-heading text-xl font-bold sm:text-2xl">Directorio de {businessName}</h1>
              <p className="mt-1 max-w-xl font-body text-sm text-muted-foreground">
                Clientes y domicilios guardados únicamente para este negocio.
              </p>
            </div>
            <div className="font-data text-xs text-muted-foreground">
              {loading ? "Cargando…" : `${customers.length} ${customers.length === 1 ? "cliente" : "clientes"}`}
              {customers.length === 100 ? " · primeros 100" : ""}
            </div>
          </div>

          <div className="grid min-h-[min(72dvh,760px)] gap-3 md:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.18fr)]">
            <section className={`${selectedId ? "hidden md:flex" : "flex"} min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface`}>
              <label className="m-3 flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-border bg-background px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                <Search size={17} className="text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nombre o celular"
                  className="min-w-0 flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              <div className="pos-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {loading ? (
                  <div className="flex min-h-52 items-center justify-center text-muted-foreground">
                    <RefreshCw size={21} className="animate-spin text-brand" />
                  </div>
                ) : customers.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground">
                      <UserRound size={20} />
                    </span>
                    <p className="font-heading text-sm font-bold">{search ? "Sin coincidencias" : "Aún no hay clientes"}</p>
                    <p className="mt-1 max-w-xs font-body text-xs leading-5 text-muted-foreground">
                      {search ? "Prueba con otro nombre o número." : "Los clientes se guardarán al registrar pedidos con celular."}
                    </p>
                  </div>
                ) : (
                  customers.map((customer) => {
                    const active = customer.id === selectedId;
                    return (
                      <button
        key={customer.id}
                        type="button"
                        onClick={() => {
                          setDetailsLoadingId(customer.id);
                          setAddressesOpen(false);
                          setOrdersOpen(false);
                          setAddressFormOpen(false);
                          setAddressDeleteConfirmId(null);
                          setSelectedId(customer.id);
                        }}
                        aria-current={active ? "true" : undefined}
                        className={`mb-1 flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${active ? "bg-brand-light text-foreground" : "hover:bg-surface-raised"}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-brand text-white" : "bg-background text-muted-foreground"}`}>
                          <UserRound size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-heading text-sm font-bold">
                            {customer.displayName || "Cliente sin nombre"}
                          </span>
                          <span className="mt-0.5 block font-data text-xs text-muted-foreground">
                            {formatPhoneForDisplay(customer.phone)} · {customer.addressCount} {customer.addressCount === 1 ? "domicilio" : "domicilios"}
                          </span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className={`${selectedId ? "flex" : "hidden md:flex"} min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface`}>
              {selectedId && detailsLoading ? (
                <div className="flex min-h-64 flex-1 items-center justify-center text-muted-foreground">
                  <RefreshCw size={22} className="animate-spin text-brand" />
                </div>
              ) : details ? (
                <>
                  <header className="flex items-center gap-3 border-b border-border p-4 sm:p-5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground md:hidden"
                      aria-label="Volver a clientes"
                    >
                      <ArrowLeft size={17} />
                    </button>
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand md:flex">
                      <UserRound size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-heading text-lg font-bold">
                        {details.displayName || "Cliente sin nombre"}
                      </h2>
                      <a href={`tel:${details.phone}`} className="mt-0.5 inline-flex items-center gap-1.5 font-data text-xs text-muted-foreground hover:text-foreground">
                        <Phone size={12} /> {formatPhoneForDisplay(details.phone)}
                      </a>
                      <p className="mt-1 font-body text-[11px] text-muted-foreground">
                        Cliente desde {formatDateOnly(details.createdAt)}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-data text-lg font-bold text-brand">{details.totalOrders}</p>
                      <p className="font-body text-[11px] text-muted-foreground">pedidos</p>
                    </div>
                  </header>
                  <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                    <section className="overflow-hidden rounded-xl border border-border bg-background/50">
                      <div className="flex min-h-14 items-center gap-2 px-3.5 py-2.5">
                        <button
                          type="button"
                          onClick={() => setAddressesOpen((open) => !open)}
                          aria-expanded={addressesOpen}
                          aria-controls={`customer-addresses-${details.id}`}
                          className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                        >
                          <MapPin size={17} className="shrink-0 text-brand" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-heading text-sm font-bold">
                              Domicilios guardados
                              <span className="rounded-full bg-surface-raised px-2 py-0.5 font-data text-[10px] text-muted-foreground">
                                {details.addresses.length}
                              </span>
                            </span>
                            {!addressesOpen && details.addresses[0] ? (
                              <span className="mt-0.5 block truncate font-body text-xs text-muted-foreground">
                                {details.addresses[0].label || "Principal"}: {details.addresses[0].formattedAddress || details.addresses[0].addressText}
                                {details.addresses[0].colony ? ` · Col. ${details.addresses[0].colony}` : " · Colonia no registrada"}
                              </span>
                            ) : !addressesOpen ? (
                              <span className="mt-0.5 block truncate font-body text-xs text-muted-foreground">Aún no hay domicilios</span>
                            ) : null}
                          </span>
                          <ChevronDown size={17} className={`shrink-0 text-muted-foreground transition-transform ${addressesOpen ? "rotate-180" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddressesOpen(true);
                            setAddressFormOpen((open) => !open);
                          }}
                          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-light px-2.5 font-heading text-xs font-bold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                        >
                          <Plus size={15} /> <span className="hidden sm:inline">Agregar</span>
                        </button>
                      </div>
                      {addressesOpen ? (
                        <div id={`customer-addresses-${details.id}`} className="border-t border-border">
                          {addressFormOpen ? (
                            <form onSubmit={(event) => void handleCreateAddress(event)} className="grid gap-2.5 border-b border-border bg-surface/60 p-3.5 sm:grid-cols-2">
                              <label className="sm:col-span-2">
                                <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Nombre del domicilio</span>
                                <input value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} maxLength={80} placeholder="Casa, trabajo…" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-body text-sm outline-none focus:border-brand" />
                              </label>
                              <label className="sm:col-span-2">
                                <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Calle y número</span>
                                <input value={addressText} onChange={(event) => setAddressText(event.target.value)} maxLength={500} minLength={8} required autoComplete="street-address" placeholder="Calle, número y fraccionamiento" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-body text-sm outline-none focus:border-brand" />
                              </label>
                              <label>
                                <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Colonia o fraccionamiento</span>
                                <input value={addressColony} onChange={(event) => setAddressColony(event.target.value)} maxLength={120} minLength={2} required placeholder="Colonia" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-body text-sm outline-none focus:border-brand" />
                              </label>
                              <label>
                                <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">Referencia <span className="font-body font-normal">(opcional)</span></span>
                                <input value={addressReference} onChange={(event) => setAddressReference(event.target.value)} maxLength={300} placeholder="Casa, portón, entre calles…" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-body text-sm outline-none focus:border-brand" />
                              </label>
                              <div className="flex justify-end gap-2 sm:col-span-2">
                                <button type="button" onClick={() => setAddressFormOpen(false)} disabled={addressSavePending} className="min-h-10 rounded-lg px-3 font-heading text-xs font-bold text-muted-foreground hover:bg-surface-raised disabled:opacity-50">Cancelar</button>
                                <button type="submit" disabled={addressSavePending} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3.5 font-heading text-xs font-bold text-white disabled:opacity-50">
                                  {addressSavePending ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                                  Guardar domicilio
                                </button>
                              </div>
                              <p className="font-body text-[11px] text-muted-foreground sm:col-span-2">
                                Si no se confirmó con Maps, se volverá a pedir confirmar la ubicación al usarlo en un pedido.
                              </p>
                            </form>
                          ) : null}
                          {details.addresses.length === 0 ? (
                            <p className="px-4 py-5 text-center font-body text-xs text-muted-foreground">
                              Este cliente todavía no tiene domicilios guardados.
                            </p>
                          ) : (
                            <div className="divide-y divide-border">
                              {details.addresses.map((address) => (
                                <article key={address.id} className="p-3.5">
                                  <div className="flex items-start gap-2.5">
                                    <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-heading text-xs font-bold">{address.label || "Domicilio"}</p>
                                        {address.isDefault ? <span className="rounded-full bg-success/10 px-2 py-0.5 font-heading text-[10px] font-bold text-success">Principal</span> : null}
                                      </div>
                                      <p className="mt-1 break-words font-body text-sm leading-5 text-foreground">
                                        {address.formattedAddress || address.addressText}
                                      </p>
                                      <p className={`mt-1 font-heading text-xs font-bold ${address.colony ? "text-gold" : "text-warning"}`}>
                                        Colonia: {address.colony || "No registrada"}
                                      </p>
                                      {address.reference ? <p className="mt-1 font-body text-xs text-muted-foreground">Referencia: {address.reference}</p> : null}
                                      <p className="mt-2 inline-flex items-center gap-1 font-body text-[10px] text-muted-foreground">
                                        <Clock3 size={11} /> Usado {formatDate(address.lastUsedAt)}
                                      </p>
                                      {addressDeleteConfirmId === address.id ? (
                                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 p-2.5">
                                          <span className="mr-auto font-body text-xs text-foreground">¿Eliminar este domicilio?</span>
                                          <button type="button" onClick={() => setAddressDeleteConfirmId(null)} disabled={addressDeletePendingId === address.id} className="min-h-9 rounded-lg px-2.5 font-heading text-xs font-bold text-muted-foreground">Cancelar</button>
                                          <button type="button" onClick={() => void handleDeleteAddress(address.id)} disabled={addressDeletePendingId === address.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-danger px-3 font-heading text-xs font-bold text-white disabled:opacity-50">
                                            {addressDeletePendingId === address.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                            Eliminar
                                          </button>
                                        </div>
                                      ) : (
                                        <button type="button" onClick={() => setAddressDeleteConfirmId(address.id)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 font-heading text-xs font-bold text-danger hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50">
                                          <Trash2 size={13} /> Eliminar domicilio
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </section>

                    <section className="mt-6">
                      {details.orders.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border px-4 py-4">
                          <h3 className="font-heading text-sm font-bold">Pedidos recientes</h3>
                          <p className="mt-2 text-center font-body text-xs text-muted-foreground">
                            Todavía no hay pedidos asociados a este cliente.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-border bg-background/50">
                          <button
                            type="button"
                            onClick={() => setOrdersOpen((open) => !open)}
                            aria-expanded={ordersOpen}
                            aria-controls={`customer-orders-${details.id}`}
                            className="flex min-h-14 w-full touch-manipulation items-center gap-3 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                          >
                            <Clock3 size={17} className="shrink-0 text-brand" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 font-heading text-sm font-bold">
                                Pedidos recientes
                                <span className="font-body text-[11px] font-normal text-muted-foreground">{details.totalOrders} en total</span>
                              </span>
                              {!ordersOpen ? (
                                <span className="mt-0.5 block truncate font-body text-xs text-muted-foreground">
                                  #{details.orders[0].number} · {orderTypeLabel(details.orders[0].type)} · {formatDate(details.orders[0].createdAt)}
                                  {details.orders[0].type === "domicilio" && details.orders[0].deliveryColony ? ` · Col. ${details.orders[0].deliveryColony}` : ""}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-data text-sm font-bold text-brand">
                              {formatMoney(getBusinessCustomerOrderTotal(details.orders[0]))}
                            </span>
                            <ChevronDown size={17} className={`shrink-0 text-muted-foreground transition-transform ${ordersOpen ? "rotate-180" : ""}`} />
                          </button>
                          {ordersOpen ? (
                            <div id={`customer-orders-${details.id}`} className="divide-y divide-border border-t border-border">
                              {details.orders.map((order) => (
                                <article key={order.id} className="flex items-start gap-3 p-3">
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised font-data text-xs font-bold text-brand">#{order.number}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-1.5 font-heading text-xs font-bold">
                                      {orderTypeLabel(order.type)}
                                      <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted-foreground">
                                        {getBusinessCustomerOrderStatusLabel(order.status)}
                                      </span>
                                      <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-muted-foreground">
                                        {getBusinessCustomerPaymentLabel(order.paymentStatus)}
                                      </span>
                                    </span>
                                    <span className="mt-1 block font-body text-[11px] text-muted-foreground">{formatDate(order.createdAt)}</span>
                                    {order.type === "domicilio" ? (
                                      <span className="mt-1.5 block break-words font-body text-[11px] leading-4 text-muted-foreground">
                                        <span className="font-heading font-bold text-gold">Colonia: {order.deliveryColony || "No registrada"}</span>
                                        {order.deliveryAddress ? <><br />{order.deliveryAddress}</> : null}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="shrink-0 text-right">
                                    <span className="block font-data text-sm font-bold">{formatMoney(getBusinessCustomerOrderTotal(order))}</span>
                                    {order.type === "domicilio" && order.deliveryFee > 0 ? (
                                      <span className="mt-0.5 block font-body text-[10px] text-muted-foreground">incluye envío {formatMoney(order.deliveryFee)}</span>
                                    ) : null}
                                  </span>
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <div className="flex min-h-64 flex-1 flex-col items-center justify-center px-6 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-background text-muted-foreground">
                    <Building2 size={20} />
                  </span>
                  <p className="font-heading text-sm font-bold">Selecciona un cliente</p>
                  <p className="mt-1 max-w-xs font-body text-xs leading-5 text-muted-foreground">
                    Sus domicilios y pedidos recientes aparecerán aquí.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
