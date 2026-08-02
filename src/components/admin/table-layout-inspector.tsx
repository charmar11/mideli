"use client";

import { useEffect } from "react";
import { Check, Minus, MoveDiagonal2, Plus, RotateCw, Save, Trash2, X } from "lucide-react";
import type { RestaurantTable, TableMapLabel, TableShape, TableZone } from "@/types/database";

const SHAPES: Array<{ value: TableShape; label: string }> = [
  { value: "round", label: "Redonda" },
  { value: "square", label: "Cuadrada" },
  { value: "rectangle", label: "Rectangular" },
  { value: "bar", label: "Barra" },
];

const LABEL_PRESETS = [
  { label: "Mideli", background_color: "#F5145F", text_color: "#FFFFFF", border_color: "#FF3B78" },
  { label: "Barra", background_color: "#2A242E", text_color: "#FBF8E7", border_color: "#F6DDA4" },
  { label: "Caja", background_color: "#211D24", text_color: "#FBF8E7", border_color: "#36C275" },
  { label: "Entrada", background_color: "#211D24", text_color: "#FBF8E7", border_color: "#B9AEB1" },
  { label: "Cocina", background_color: "#0D0B10", text_color: "#FBF8E7", border_color: "#F3A34D" },
  { label: "Baños", background_color: "#211D24", text_color: "#FBF8E7", border_color: "#7DD3FC" },
];

interface TableLayoutInspectorProps {
  zone: TableZone | null;
  table: RestaurantTable | null;
  label: TableMapLabel | null;
  zones: TableZone[];
  tableCount: number;
  saving?: boolean;
  onClose: () => void;
  onChangeZone: (updates: Partial<TableZone>) => void;
  onChangeTable: (updates: Partial<RestaurantTable>) => void;
  onChangeLabel: (updates: Partial<TableMapLabel>) => void;
  onSaveZone: () => void;
  onSaveTable: () => void;
  onDeactivateZone: () => void;
  onDeactivateTable: () => void;
  onSaveLabel: () => void;
  onDeactivateLabel: () => void;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function TableLayoutInspector({
  zone,
  table,
  label,
  zones,
  tableCount,
  saving = false,
  onClose,
  onChangeZone,
  onChangeTable,
  onChangeLabel,
  onSaveZone,
  onSaveTable,
  onDeactivateZone,
  onDeactivateTable,
  onSaveLabel,
  onDeactivateLabel,
}: TableLayoutInspectorProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!zone && !table && !label) return null;

  const entityName = table?.name ?? zone?.name ?? label?.label_text ?? "Elemento";
  const isZone = Boolean(zone);
  const isLabel = Boolean(label);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-layout-inspector-title"
        className="pointer-events-auto flex max-h-[min(90dvh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-float"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-brand-light px-2.5 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
              {isZone ? "Zona" : isLabel ? "Referencia" : "Mesa"}
            </span>
            <h2
              id="table-layout-inspector-title"
              className="mt-2 truncate font-heading text-xl font-bold text-foreground"
            >
              {entityName}
            </h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              {isZone
                ? `${tableCount} ${tableCount === 1 ? "mesa" : "mesas"} en esta zona`
                : isLabel
                  ? "Personaliza el texto y los colores del mapa"
                  : "Ajusta los datos y la apariencia de esta mesa"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cerrar editor"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {zone ? (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">
                  Nombre de la zona
                </span>
                <input
                  autoFocus
                  value={zone.name}
                  onChange={(event) => onChangeZone({ name: event.target.value })}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 font-heading text-sm font-semibold text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </label>

              <div className="flex items-center gap-3 rounded-2xl bg-background p-4">
                <MoveDiagonal2 size={18} className="shrink-0 text-brand" />
                <span className="font-heading text-sm font-bold text-foreground">Tamaño actual</span>
                <span className="ml-auto rounded-lg bg-surface-raised px-2 py-1 font-data text-[10px] text-muted-foreground">
                  {formatPercent(zone.width)} × {formatPercent(zone.height)}
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-surface-raised p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-heading text-sm font-bold text-foreground">Mesas dentro</span>
                  <span className="font-data text-lg font-bold text-brand">{tableCount}</span>
                </div>
                <p className="mt-2 font-body text-xs leading-relaxed text-muted-foreground">
                  Para mover la zona, arrastra su encabezado directamente en el plano.
                </p>
              </div>
            </div>
          ) : null}

          {table ? (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">
                  Nombre de la mesa
                </span>
                <input
                  autoFocus
                  value={table.name}
                  onChange={(event) => onChangeTable({ name: event.target.value })}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 font-heading text-sm font-semibold text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </label>

              <label className="block">
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">Zona</span>
                <select
                  value={table.zone_id ?? ""}
                  onChange={(event) => onChangeTable({ zone_id: event.target.value || null })}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 font-heading text-sm font-semibold text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                >
                  {zones.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">Forma</span>
                <div className="grid grid-cols-2 gap-2">
                  {SHAPES.map((shape) => {
                    const selected = table.shape === shape.value;
                    return (
                      <button
                        key={shape.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChangeTable({ shape: shape.value })}
                        className={`flex min-h-12 items-center justify-between rounded-xl border px-3 text-left font-heading text-xs font-bold transition-colors ${
                          selected
                            ? "border-brand bg-brand-light text-brand"
                            : "border-border bg-background text-muted-foreground hover:border-brand/50 hover:text-foreground"
                        }`}
                      >
                        {shape.label}
                        {selected ? <Check size={16} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">Capacidad</span>
                <div className="flex h-12 items-center justify-between rounded-xl border border-border bg-background p-1">
                  <button
                    type="button"
                    onClick={() => onChangeTable({ capacity: clamp(table.capacity - 1, 1, 100) })}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised text-foreground hover:text-brand"
                    aria-label="Reducir capacidad"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="font-data text-base font-bold text-foreground">
                    {table.capacity} personas
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeTable({ capacity: clamp(table.capacity + 1, 1, 100) })}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised text-foreground hover:text-brand"
                    aria-label="Aumentar capacidad"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-background p-4">
                <MoveDiagonal2 size={18} className="shrink-0 text-brand" />
                <span className="font-heading text-sm font-bold text-foreground">Tamaño actual</span>
                <span className="ml-auto rounded-lg bg-surface-raised px-2 py-1 font-data text-[10px] text-muted-foreground">
                  {formatPercent(table.width)} × {formatPercent(table.height)}
                </span>
              </div>

              <label className="block rounded-2xl bg-background p-4">
                <span className="mb-3 flex items-center gap-2 font-heading text-xs font-bold text-muted-foreground">
                  <RotateCw size={14} /> Rotación
                  <span className="ml-auto font-data text-foreground">{table.rotation}°</span>
                </span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="15"
                  value={table.rotation}
                  onChange={(event) => onChangeTable({ rotation: Number(event.target.value) })}
                  className="h-2 w-full accent-brand"
                />
              </label>
            </div>
          ) : null}

          {label ? (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">
                  Texto de referencia
                </span>
                <input
                  autoFocus
                  value={label.label_text}
                  onChange={(event) => onChangeLabel({ label_text: event.target.value })}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 font-heading text-sm font-semibold text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                  placeholder="Ej. Mideli, Barra o Entrada"
                />
              </label>

              <div>
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">
                  Referencias rápidas
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {LABEL_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onChangeLabel({
                          label_text: preset.label,
                          background_color: preset.background_color,
                          text_color: preset.text_color,
                          border_color: preset.border_color,
                        })
                      }
                      className={`min-h-11 rounded-xl border px-2 text-left font-heading text-xs font-bold transition-colors ${
                        label.label_text === preset.label
                          ? "border-brand bg-brand-light text-brand"
                          : "border-border bg-background text-muted-foreground hover:border-brand/50 hover:text-foreground"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-2 block font-heading text-xs font-bold text-muted-foreground">
                  Colores editables
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["background_color", "Fondo"],
                    ["text_color", "Texto"],
                    ["border_color", "Borde"],
                  ] as const).map(([key, name]) => (
                    <label key={key} className="rounded-xl border border-border bg-background p-2">
                      <span className="mb-2 block text-center font-body text-[11px] text-muted-foreground">
                        {name}
                      </span>
                      <input
                        type="color"
                        value={label[key]}
                        onChange={(event) => onChangeLabel({ [key]: event.target.value })}
                        className="h-10 w-full cursor-pointer rounded-lg border-0 bg-transparent p-0"
                        aria-label={`Color de ${name.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div
                className="flex min-h-20 items-center justify-center rounded-2xl border-2 px-4"
                style={{
                  backgroundColor: label.background_color,
                  borderColor: label.border_color,
                  color: label.text_color,
                }}
              >
                <span className="truncate font-heading text-sm font-bold">{label.label_text || "Referencia"}</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex gap-2 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={isZone ? onDeactivateZone : isLabel ? onDeactivateLabel : onDeactivateTable}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
            aria-label={isZone ? "Desactivar zona" : isLabel ? "Eliminar referencia" : "Desactivar mesa"}
            title={isZone ? "Desactivar zona" : isLabel ? "Eliminar referencia" : "Desactivar mesa"}
          >
            <Trash2 size={17} />
          </button>
          <button
            type="button"
            onClick={isZone ? onSaveZone : isLabel ? onSaveLabel : onSaveTable}
            disabled={saving}
            className="action-success inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 font-heading text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {saving
              ? "Guardando..."
              : isZone
                ? "Guardar zona"
                : isLabel
                  ? "Guardar referencia"
                  : "Guardar mesa"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl border border-border px-4 font-heading text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancelar
          </button>
        </footer>
      </section>
    </div>
  );
}
