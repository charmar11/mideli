"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2,
  Circle,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useCatalogStore } from "@/lib/stores";
import type { Category } from "@/types/database";

interface SortableCategoryRowProps {
  category: Category;
  editing: boolean;
  editName: string;
  reorderDisabled: boolean;
  onEditNameChange: (name: string) => void;
  onStartEdit: (category: Category) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}

function SortableCategoryRow({
  category,
  editing,
  editName,
  reorderDisabled,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onDelete,
}: SortableCategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: editing || reorderDisabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`group flex min-h-14 items-center rounded-xl border bg-card p-1.5 transition-[border-color,box-shadow,opacity] ${
        isDragging
          ? "z-20 border-brand shadow-xl shadow-brand/15"
          : "border-border"
      } ${!category.is_active ? "opacity-55" : ""}`}
    >
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-35 cursor-grab active:cursor-grabbing"
        aria-label={`Mover categoría ${category.name}`}
        title="Arrastrar para cambiar el orden"
        disabled={editing || reorderDisabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>

      {editing ? (
        <input
          type="text"
          value={editName}
          onChange={(event) => onEditNameChange(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 font-body text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
          aria-label={`Nombre de categoría ${category.name}`}
          autoFocus
          onBlur={onSaveEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSaveEdit();
            if (event.key === "Escape") onCancelEdit();
          }}
        />
      ) : (
        <button
          type="button"
          className="min-h-11 min-w-0 flex-1 rounded-lg px-1 py-2 text-left font-heading text-sm font-semibold leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
          onClick={() => onStartEdit(category)}
          title={category.name}
        >
          {category.name}
        </button>
      )}

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onStartEdit(category)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
          title="Editar categoría"
          aria-label={`Editar categoría ${category.name}`}
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onToggle(category.id, category.is_active)}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer ${
            category.is_active
              ? "text-success hover:bg-warning/10 hover:text-warning"
              : "text-muted-foreground hover:bg-success/10 hover:text-success"
          }`}
          title={category.is_active ? "Desactivar" : "Activar"}
          aria-label={`${category.is_active ? "Desactivar" : "Activar"} ${category.name}`}
        >
          {category.is_active ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <Circle size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onDelete(category.id)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
          title="Eliminar categoría"
          aria-label={`Eliminar categoría ${category.name}`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function CategoryManager() {
  const {
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  } = useCatalogStore();
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isReordering, setIsReordering] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    if (
      !confirm(
        "¿Eliminar esta categoría? También se eliminarán los productos asociados."
      )
    ) {
      return;
    }
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || isReordering) return;

    const oldIndex = categories.findIndex((category) => category.id === active.id);
    const newIndex = categories.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextCategories = arrayMove(categories, oldIndex, newIndex);
    setIsReordering(true);
    try {
      const saved = await reorderCategories(
        nextCategories.map((category) => category.id)
      );
      if (!saved) {
        toast.error("No se pudo guardar el orden", {
          description: "Se restauró el orden anterior.",
        });
      }
    } finally {
      setIsReordering(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 items-center justify-between">
        <div>
          <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Categorías
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Arrastra el control para ordenar
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-brand-light hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
          aria-label="Agregar categoría"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      {showForm && (
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-2">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nombre de categoría"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
            autoFocus
            onKeyDown={(event) => event.key === "Enter" && handleCreate()}
          />
          <button
            type="button"
            onClick={handleCreate}
            className="min-h-11 rounded-lg bg-brand px-3 text-xs font-bold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface cursor-pointer"
          >
            Guardar
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((category) => category.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2" aria-label="Orden de categorías">
            {categories.map((category) => (
              <SortableCategoryRow
                key={category.id}
                category={category}
                editing={editingId === category.id}
                editName={editName}
                reorderDisabled={isReordering}
                onEditNameChange={setEditName}
                onStartEdit={startEdit}
                onSaveEdit={handleUpdate}
                onCancelEdit={() => {
                  setEditingId(null);
                  setEditName("");
                }}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
