"use client";

import { useState } from "react";
import { Check, MapPin, X } from "lucide-react";
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

export function TablePicker({
  zones,
  tables,
  labels = [],
  selectedTableId,
  onClose,
  onConfirm,
}: TablePickerProps) {
  const [pendingTableId, setPendingTableId] = useState(selectedTableId);
  const pendingTable = tables.find((table) => table.id === pendingTableId) ?? null;
  const pendingZone = pendingTable
    ? zones.find((zone) => zone.id === pendingTable.zone_id)
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-tour="pos-table-map"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-picker-title"
        className="flex h-[min(92dvh,48rem)] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-float sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
              <MapPin size={18} />
            </span>
            <div>
              <h2 id="table-picker-title" className="font-heading text-base font-bold">
                Seleccionar mesa
              </h2>
              <p className="font-body text-[11px] text-muted-foreground">
                Toca una mesa en el plano
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground hover:text-foreground"
            aria-label="Cerrar selector de mesa"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <TableFloorMap
            zones={zones}
            tables={tables}
            labels={labels}
            selectedTableId={pendingTableId}
            onSelectTable={(table) => setPendingTableId(table.id)}
          />

          <aside className="flex flex-col rounded-2xl border border-border bg-surface p-4">
            <div className="flex-1">
              <p className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Mesa elegida
              </p>
              {pendingTable ? (
                <div className="mt-3 rounded-2xl bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-bold">{pendingTable.name}</h3>
                      <p className="mt-1 font-body text-sm text-muted-foreground">
                        {pendingZone?.name ?? "Sin zona"}
                      </p>
                    </div>
                    <Check className="text-brand" size={20} />
                  </div>
                  <p className="mt-4 font-data text-xs text-muted-foreground">
                    Capacidad: {pendingTable.capacity} personas
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-2xl bg-background p-4 font-body text-sm text-muted-foreground">
                  Selecciona una mesa para continuar.
                </p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-12 flex-1 rounded-xl border border-border font-heading text-sm font-bold text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!pendingTable}
                onClick={() => pendingTable && onConfirm(pendingTable)}
                className="action-success inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={16} />
                Confirmar
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
