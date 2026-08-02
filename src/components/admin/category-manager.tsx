"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useCatalogStore } from "@/lib/stores";
import type { Category } from "@/types/database";

export function CategoryManager() {
  const { categories, createCategory, updateCategory, deleteCategory } =
    useCatalogStore();
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function handleCreate() {
    if (!newName.trim()) return;
    const created = await createCategory(newName.trim());
    if (!created) {
      toast.error("No se pudo crear la categoría");
      return;
    }
    setNewName("");
    setShowForm(false);
    toast.success("Categoría creada");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
  }

  async function handleUpdate() {
    if (!editingId || !editName.trim()) return;
    const updated = await updateCategory(editingId, { name: editName.trim() });
    if (!updated) {
      toast.error("No se pudo actualizar la categoría");
      return;
    }
    setEditingId(null);
    setEditName("");
    toast.success("Categoría actualizada");
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta categoría? También se eliminarán los productos asociados.")) return;
    const deleted = await deleteCategory(id);
    if (!deleted) {
      toast.error("No se pudo eliminar la categoría");
      return;
    }
    toast.success("Categoría eliminada");
  }

  async function handleToggle(id: string, isActive: boolean) {
    const updated = await updateCategory(id, { is_active: !isActive });
    if (!updated) {
      toast.error("No se pudo actualizar el estado de la categoría");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 items-center justify-between">
        <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Categorías
        </h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-brand-light hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
          aria-label="Agregar categoría"
        >
          <Plus size={16} />
        </button>
      </div>

      {showForm && (
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre..."
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-body text-xs text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            type="button"
            onClick={handleCreate}
            className="min-h-9 rounded-lg bg-brand px-3 text-xs font-bold text-white cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {categories.map((category) => (
        <div
          key={category.id}
          className={`group flex min-h-12 items-center gap-1 rounded-xl border border-border bg-card p-2 transition-colors ${
            !category.is_active ? "opacity-50" : ""
          }`}
        >
          <GripVertical
            size={14}
            className="hidden shrink-0 text-muted-foreground/30 sm:block"
          />
          {editingId === category.id ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 font-body text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
              autoFocus
              onBlur={handleUpdate}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdate();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <span
              className="min-w-0 flex-1 cursor-pointer truncate px-1 font-heading text-sm font-semibold text-foreground"
              onClick={() => startEdit(category)}
            >
              {category.name}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => startEdit(category)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
              title="Editar categoría"
              aria-label={`Editar categoría ${category.name}`}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={() => handleToggle(category.id, category.is_active)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer ${
                category.is_active
                  ? "text-success hover:text-warning"
                  : "text-muted-foreground hover:text-success"
              }`}
              title={category.is_active ? "Desactivar" : "Activar"}
              aria-label={`${category.is_active ? "Desactivar" : "Activar"} ${category.name}`}
            >
              {category.is_active ? "●" : "○"}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(category.id)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
              title="Eliminar categoría"
              aria-label={`Eliminar categoría ${category.name}`}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
