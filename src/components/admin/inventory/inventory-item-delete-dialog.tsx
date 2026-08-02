"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore } from "@/lib/stores/inventory-store";
import type { InventoryItem } from "@/types/database";

export function InventoryItemDeleteDialog({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const { deleteItemPermanently } = useInventoryStore();
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const confirmed = confirmation === item.name;

  async function handleDelete() {
    if (!confirmed || working) return;
    setWorking(true);
    const result = await deleteItemPermanently(item.id, confirmation);
    setWorking(false);
    if (result.error) {
      toast.error("No se pudo eliminar el insumo", { description: result.error });
      return;
    }
    const related = result.data
      ? result.data.recipes + result.data.movements + result.data.lots + result.data.count_lines + result.data.receipt_lines + result.data.purchase_lines
      : 0;
    toast.success("Insumo eliminado definitivamente", {
      description: related > 0 ? `También se eliminaron ${related} registros relacionados.` : undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/72 p-0 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && !working && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="delete-inventory-title" className="w-full max-w-lg rounded-t-3xl border border-border bg-surface shadow-float sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive/12 text-destructive"><AlertTriangle size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-inventory-title" className="font-heading text-base font-bold text-foreground">Eliminar definitivamente</h2>
            <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">Esta acción está pensada para pruebas o registros creados por error.</p>
          </div>
          <button type="button" disabled={working} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-40" aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="space-y-4 px-4 py-5 sm:px-5">
          <div className="rounded-xl bg-destructive/8 px-3.5 py-3">
            <p className="font-heading text-xs font-bold text-destructive">No se puede deshacer</p>
            <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">Se eliminarán <strong className="text-foreground">{item.name}</strong> y sus recetas, compras, conteos, lotes y movimientos relacionados.</p>
          </div>
          <label className="block">
            <span className="mb-2 block font-heading text-xs font-bold text-foreground">Escribe el nombre para confirmar</span>
            <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={item.name} className="form-input" aria-label="Nombre del insumo para confirmar" />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
          <button type="button" disabled={working} onClick={onClose} className="h-11 rounded-xl px-4 font-heading text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-40">Cancelar</button>
        <button type="button" disabled={!confirmed || working} onClick={() => void handleDelete()} className="action-danger inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-heading text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">
            {working ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Eliminar todo
          </button>
        </footer>
      </section>
    </div>
  );
}
