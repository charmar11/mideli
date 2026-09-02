"use client";

import { useEffect, useState } from "react";
import { Check, List, Map, MapPin, Users, X } from "lucide-react";
import { TableFloorMap } from "@/components/tables";
import type { RestaurantTable, TableMapLabel, TableZone } from "@/types/database";

interface TablePickerProps {
  zones: TableZone[];
  tables: RestaurantTable[];
  labels?: TableMapLabel[];
  selectedTableId: string;
  onClose: () => void;
  onConfirm: (table: RestaurantTable) => void;
}

type MobileTableView = "map" | "list";

export function TablePicker({
  zones,
  tables,
  labels = [],
  selectedTableId,
  onClose,
  onConfirm,
}: TablePickerProps) {
  const pendingTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const initialZoneId = pendingTable?.zone_id ?? zones[0]?.id ?? "";
  const [pendingTableId, setPendingTableId] = useState(selectedTableId);
  const [mobileZoneId, setMobileZoneId] = useState(initialZoneId);
  const [mobileView, setMobileView] = useState<MobileTableView>("map");
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const selectedTable = tables.find((table) => table.id === pendingTableId) ?? null;
  const selectedZone = selectedTable
    ? zones.find((zone) => zone.id === selectedTable.zone_id) ?? null
    : null;
  const effectiveMobileZoneId = zones.some((zone) => zone.id === mobileZoneId)
    ? mobileZoneId
    : zones[0]?.id ?? "";
  const mobileZone = zones.find((zone) => zone.id === effectiveMobileZoneId) ?? null;
  const mobileTables = mobileZone
    ? tables.filter((table) => table.zone_id === mobileZone.id)
    : [];

  function chooseMobileZone(zone: TableZone) {
    setMobileZoneId(zone.id);
    if (selectedTable && selectedTable.zone_id !== zone.id) setPendingTableId("");
  }

  function chooseTable(table: RestaurantTable) {
    setPendingTableId(table.id);
    if (table.zone_id) setMobileZoneId(table.zone_id);
  }

  const mobileSelectionSummary = selectedTable ? (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
        <Check size={19} />
      </span>
      <div className="min-w-0">
        <p className="font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Mesa seleccionada
        </p>
        <p className="truncate font-heading text-sm font-bold text-foreground">{selectedTable.name}</p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {selectedZone?.name ?? "Sin zona"} · {selectedTable.capacity} personas
        </p>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground">
        <MapPin size={19} />
      </span>
      <div>
        <p className="font-heading text-sm font-bold text-foreground">Ninguna mesa seleccionada</p>
        <p className="font-body text-xs text-muted-foreground">Elige una mesa para continuar</p>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-x-hidden bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-tour="pos-table-map"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-picker-title"
        className="flex h-[min(94dvh,48rem)] min-w-0 w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-float sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              <MapPin size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="table-picker-title" className="font-heading text-base font-bold">Seleccionar mesa</h2>
              <p className="font-body text-[11px] text-muted-foreground">Elige una mesa disponible</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground"
            aria-label="Cerrar selector de mesa"
          >
            <X size={19} />
          </button>
        </header>

        {isMobileViewport ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
            {zones.length > 1 ? (
              <div className="shrink-0">
                <p className="mb-2 font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Zona</p>
                <div className="grid max-h-28 grid-cols-2 gap-2 overflow-y-auto">
                  {zones.map((zone) => {
                    const zoneTableCount = tables.filter((table) => table.zone_id === zone.id).length;
                    const active = mobileZone?.id === zone.id;
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => chooseMobileZone(zone)}
                        className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left transition-colors ${
                          active ? "border-brand bg-brand-light text-brand" : "border-border bg-surface text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="min-w-0 truncate font-heading text-xs font-bold">{zone.name}</span>
                        <span className="shrink-0 font-data text-[10px]">{zoneTableCount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-surface p-1" aria-label="Modo de selección">
              <button
                type="button"
                aria-pressed={mobileView === "map"}
                onClick={() => setMobileView("map")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg font-heading text-xs font-bold transition-colors ${mobileView === "map" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Map size={16} /> Mapa
              </button>
              <button
                type="button"
                aria-pressed={mobileView === "list"}
                onClick={() => setMobileView("list")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg font-heading text-xs font-bold transition-colors ${mobileView === "list" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List size={16} /> Lista
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {mobileView === "map" ? (
                <TableFloorMap
                  zones={mobileZone ? [mobileZone] : []}
                  tables={mobileTables}
                  selectedTableId={pendingTableId}
                  onSelectTable={chooseTable}
                  selectionMode
                  fitSingleZone
                  showLabels={false}
                  className="h-full w-full"
                />
              ) : (
                <div className="h-full touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-2">
                  {mobileTables.length > 0 ? (
                    <div className="grid gap-2">
                      {mobileTables.map((table) => {
                        const active = pendingTableId === table.id;
                        return (
                          <button
                            key={table.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => chooseTable(table)}
                            className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 text-left transition-colors ${
                              active ? "border-brand bg-brand-light text-brand" : "border-border bg-background text-foreground hover:border-brand/60"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-data text-xs font-bold ${active ? "bg-brand text-white" : "bg-surface-raised text-muted-foreground"}`}>
                                {table.name.replace(/^mesa\s*/i, "#")}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-heading text-sm font-bold">{table.name}</span>
                                <span className="mt-0.5 flex items-center gap-1 font-body text-xs text-muted-foreground">
                                  <Users size={13} /> {table.capacity} personas
                                </span>
                              </span>
                            </span>
                            {active ? <Check size={18} className="shrink-0 text-brand" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-48 items-center justify-center px-6 text-center">
                      <div>
                        <Users className="mx-auto mb-2 text-muted-foreground/60" size={25} />
                        <p className="font-heading text-sm font-bold text-muted-foreground">Esta zona no tiene mesas</p>
                        <p className="mt-1 font-body text-xs text-muted-foreground">Selecciona otra zona para continuar.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 rounded-2xl border border-border bg-surface p-3">{mobileSelectionSummary}</div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-14 rounded-xl border border-border px-3 font-heading text-sm font-bold text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedTable}
                onClick={() => selectedTable && onConfirm(selectedTable)}
                className="action-success inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={18} /> Confirmar mesa
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <TableFloorMap
              zones={zones}
              tables={tables}
              labels={labels}
              selectedTableId={pendingTableId}
              onSelectTable={(table) => setPendingTableId(table.id)}
            />

            <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface p-4">
              <div className="min-h-0 flex-1">
                <p className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mesa elegida</p>
                {selectedTable ? (
                  <div className="mt-3 rounded-2xl bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-lg font-bold">{selectedTable.name}</h3>
                        <p className="mt-1 truncate font-body text-sm text-muted-foreground">{selectedZone?.name ?? "Sin zona"}</p>
                      </div>
                      <Check className="shrink-0 text-brand" size={20} />
                    </div>
                    <p className="mt-4 font-data text-xs text-muted-foreground">Capacidad: {selectedTable.capacity} personas</p>
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl bg-background p-4 font-body text-sm text-muted-foreground">Selecciona una mesa para continuar.</p>
                )}
              </div>

              <div className="mt-4 flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-12 flex-1 rounded-xl border border-border font-heading text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!selectedTable}
                  onClick={() => selectedTable && onConfirm(selectedTable)}
                  className="action-success inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check size={16} /> Confirmar
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
