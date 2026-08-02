"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  PackagePlus,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore } from "@/lib/stores/inventory-store";
import type { InventoryItem } from "@/types/database";
import { formatInventoryMoney, formatInventoryNumber } from "./inventory-ui";

const USE_UNITS = ["pieza", "gramo", "kilogramo", "mililitro", "litro", "porción"];
const PURCHASE_UNITS = ["caja", "paquete", "bolsa", "botella", "lata", "charola", "pieza"];

type ItemDraft = {
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
  targetStock: string;
  purchaseUnit: string;
  conversionFactor: string;
  packageCost: string;
  minimumPurchaseQuantity: string;
  supplier: string;
  supplierPhone: string;
  storageLocation: string;
  countFrequency: string;
  tracksExpiry: boolean;
};

function draftFromItem(item?: InventoryItem | null): ItemDraft {
  return {
    name: item?.name ?? "",
    unit: item?.unit ?? "pieza",
    currentStock: String(item?.current_stock ?? 0),
    minimumStock: String(item?.minimum_stock ?? 0),
    targetStock: String(item?.target_stock ?? 0),
    purchaseUnit: item?.purchase_unit ?? "caja",
    conversionFactor: String(item?.purchase_conversion_factor ?? 1),
    packageCost: String(item?.last_purchase_package_cost ?? 0),
    minimumPurchaseQuantity: String(item?.minimum_purchase_quantity ?? 1),
    supplier: item?.preferred_supplier ?? "",
    supplierPhone: item?.preferred_supplier_phone ?? "",
    storageLocation: item?.storage_location ?? "",
    countFrequency: String(item?.count_frequency_days ?? 7),
    tracksExpiry: item?.tracks_expiry ?? false,
  };
}

function InputField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-heading text-xs font-bold text-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block font-body text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function InventoryItemEditor({
  item,
  onClose,
}: {
  item?: InventoryItem | null;
  onClose: () => void;
}) {
  const { createItem, updateItem } = useInventoryStore();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(() => draftFromItem(item));
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(item);

  const conversion = Math.max(0, Number(draft.conversionFactor) || 0);
  const packageCost = Math.max(0, Number(draft.packageCost) || 0);
  const unitCost = conversion > 0 ? packageCost / conversion : 0;

  const basicsValid = Boolean(draft.name.trim()) &&
    draft.currentStock.trim() !== "" && Number.isFinite(Number(draft.currentStock)) && Number(draft.currentStock) >= 0 &&
    draft.minimumStock.trim() !== "" && Number.isFinite(Number(draft.minimumStock)) && Number(draft.minimumStock) >= 0 &&
    draft.targetStock.trim() !== "" && Number.isFinite(Number(draft.targetStock)) && Number(draft.targetStock) >= Number(draft.minimumStock);
  const purchaseValid = Boolean(draft.purchaseUnit.trim()) &&
    draft.conversionFactor.trim() !== "" && Number.isFinite(Number(draft.conversionFactor)) && conversion > 0 &&
    draft.packageCost.trim() !== "" && Number.isFinite(Number(draft.packageCost)) && packageCost >= 0 &&
    draft.minimumPurchaseQuantity.trim() !== "" && Number.isFinite(Number(draft.minimumPurchaseQuantity)) && Number(draft.minimumPurchaseQuantity) >= 1;
  const controlValid = draft.countFrequency.trim() !== "" &&
    Number.isFinite(Number(draft.countFrequency)) && Number(draft.countFrequency) >= 1;

  const stepValid = useMemo(() => {
    if (step === 1) return basicsValid;
    if (step === 2) return purchaseValid;
    return controlValid;
  }, [basicsValid, controlValid, purchaseValid, step]);

  function update<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function advance() {
    if (!stepValid) {
      toast.error("Revisa los campos de este paso");
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function save() {
    if (!basicsValid || !purchaseValid || !controlValid) {
      toast.error("Revisa los datos de los tres pasos");
      return;
    }

    const minimumStock = Number(draft.minimumStock) || 0;
    const payload = {
      name: draft.name.trim(),
      unit: draft.unit.trim() || "pieza",
      minimum_stock: minimumStock,
      target_stock: Math.max(minimumStock, Number(draft.targetStock) || 0),
      cost_per_unit: unitCost,
      purchase_unit: draft.purchaseUnit.trim() || draft.unit.trim() || "pieza",
      purchase_conversion_factor: conversion,
      minimum_purchase_quantity: Math.max(1, Number(draft.minimumPurchaseQuantity) || 1),
      preferred_supplier: draft.supplier.trim(),
      preferred_supplier_phone: draft.supplierPhone.trim(),
      storage_location: draft.storageLocation.trim(),
      count_frequency_days: Math.min(365, Math.max(1, Number(draft.countFrequency) || 7)),
      tracks_expiry: draft.tracksExpiry,
      last_purchase_package_cost: packageCost,
    };

    setSaving(true);
    const result = item
      ? await updateItem(item.id, payload)
      : await createItem({
          ...payload,
          current_stock: Math.max(0, Number(draft.currentStock) || 0),
        });
    setSaving(false);

    if (result.error) {
      toast.error("No se pudo guardar el insumo", { description: result.error });
      return;
    }
    toast.success(item ? "Insumo actualizado" : "Insumo creado");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-item-title"
        className="flex h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-float sm:h-auto sm:max-h-[min(90dvh,800px)] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4 sm:px-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-light text-brand">
            <PackagePlus size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-data text-[10px] font-bold uppercase tracking-[0.2em] text-brand">Paso {step} de 3</p>
            <h2 id="inventory-item-title" className="mt-0.5 font-heading text-lg font-bold text-foreground">
              {isEditing ? `Editar ${item?.name}` : "Nuevo insumo"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground" aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>

        <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-border px-4 py-3 sm:px-6">
          {["Datos básicos", "Cómo lo compras", "Proveedor y control"].map((label, index) => {
            const number = index + 1;
            return (
              <button
                key={label}
                type="button"
                onClick={() => number < step && setStep(number)}
                className={`min-w-0 rounded-xl px-2 py-2 text-left ${number === step ? "bg-brand-light" : "bg-background/60"}`}
              >
                <span className={`block font-data text-[10px] font-bold ${number <= step ? "text-brand" : "text-muted-foreground"}`}>0{number}</span>
                <span className="mt-0.5 hidden truncate font-heading text-[11px] font-bold text-foreground sm:block">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <InputField label="Nombre del insumo" hint="Usa un nombre fácil de reconocer durante el servicio.">
                  <input autoFocus value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Nombre del ingrediente" className="form-input" />
                </InputField>
              </div>
              <InputField label="Unidad de uso" hint={isEditing ? "La unidad se protege para no alterar movimientos anteriores." : "Es la unidad que descontarán las recetas."}>
                <select disabled={isEditing} value={draft.unit} onChange={(event) => update("unit", event.target.value)} className="form-input disabled:cursor-not-allowed disabled:opacity-55">
                  {USE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </InputField>
              <InputField label="Existencia inicial">
                <input disabled={isEditing} type="number" min="0" step="0.0001" value={draft.currentStock} onChange={(event) => update("currentStock", event.target.value)} className="form-input disabled:opacity-55" />
              </InputField>
              <InputField label="Alerta de stock" hint="Mideli avisará cuando llegues a esta cantidad.">
                <input type="number" min="0" step="0.0001" value={draft.minimumStock} onChange={(event) => update("minimumStock", event.target.value)} className="form-input" />
              </InputField>
              <InputField label="Existencia ideal" hint="Se usa para sugerir cuánto comprar.">
                <input type="number" min={draft.minimumStock || "0"} step="0.0001" value={draft.targetStock} onChange={(event) => update("targetStock", event.target.value)} className="form-input" />
              </InputField>
            </div>
          ) : step === 2 ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Unidad de compra" hint="Cómo aparece en la factura o con el proveedor.">
                  <select value={draft.purchaseUnit} onChange={(event) => update("purchaseUnit", event.target.value)} className="form-input">
                    {PURCHASE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </InputField>
                <InputField label={`¿Cuántas ${draft.unit} contiene?`} hint={`Ejemplo: una ${draft.purchaseUnit} contiene 100 ${draft.unit}.`}>
                  <input type="number" min="0.0001" step="0.0001" value={draft.conversionFactor} onChange={(event) => update("conversionFactor", event.target.value)} className="form-input" />
                </InputField>
                <InputField label={`Precio por ${draft.purchaseUnit}`} hint="Puedes actualizarlo al recibir cada compra.">
                  <input type="number" min="0" step="0.01" value={draft.packageCost} onChange={(event) => update("packageCost", event.target.value)} className="form-input" />
                </InputField>
                <InputField label="Pedido mínimo" hint={`Mínimo de ${draft.purchaseUnit} que acepta el proveedor.`}>
                  <input type="number" min="1" step="1" value={draft.minimumPurchaseQuantity} onChange={(event) => update("minimumPurchaseQuantity", event.target.value)} className="form-input" />
                </InputField>
              </div>

              <div className="rounded-2xl border border-gold/30 bg-gold/10 p-4 sm:p-5">
                <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Conversión automática</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-heading text-sm font-bold text-foreground">
                      1 {draft.purchaseUnit || "presentación"} = {formatInventoryNumber(conversion)} {draft.unit}
                    </p>
                    <p className="mt-1 font-body text-xs text-muted-foreground">Mideli guardará el stock en {draft.unit}.</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-body text-[11px] text-muted-foreground">Costo por {draft.unit}</p>
                    <p className="font-data text-2xl font-bold text-foreground">{formatInventoryMoney(unitCost)}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Proveedor principal">
                  <input value={draft.supplier} onChange={(event) => update("supplier", event.target.value)} placeholder="Ej. Distribuidora del norte" className="form-input" />
                </InputField>
                <InputField label="Teléfono del proveedor">
                  <input inputMode="tel" value={draft.supplierPhone} onChange={(event) => update("supplierPhone", event.target.value)} placeholder="Ej. 644 123 4567" className="form-input" />
                </InputField>
                <InputField label="Dónde se guarda">
                  <input value={draft.storageLocation} onChange={(event) => update("storageLocation", event.target.value)} placeholder="Ej. Congelador 1" className="form-input" />
                </InputField>
                <InputField label="Contar cada cuántos días">
                  <input type="number" min="1" max="365" value={draft.countFrequency} onChange={(event) => update("countFrequency", event.target.value)} className="form-input" />
                </InputField>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.tracksExpiry}
                onClick={() => update("tracksExpiry", !draft.tracksExpiry)}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left hover:border-brand/35"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${draft.tracksExpiry ? "bg-brand text-white" : "bg-surface-raised text-muted-foreground"}`}>
                  {draft.tracksExpiry ? <Check size={18} /> : <Store size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-sm font-bold text-foreground">Controlar caducidad por lote</span>
                  <span className="mt-0.5 block font-body text-xs text-muted-foreground">Al recibir mercancía se pedirá la fecha de caducidad.</span>
                </span>
              </button>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-4 sm:px-6">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((current) => current - 1)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 font-heading text-sm font-bold text-foreground hover:bg-surface-raised">
              <ArrowLeft size={17} /> Atrás
            </button>
          ) : null}
          <div className="flex-1" />
          {step < 3 ? (
            <button type="button" onClick={advance} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-heading text-sm font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover">
              Continuar <ArrowRight size={17} />
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={() => void save()} className="action-success inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 font-heading text-sm font-bold disabled:opacity-50">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Guardar insumo
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
