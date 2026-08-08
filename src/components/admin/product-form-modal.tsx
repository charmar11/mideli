"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCatalogStore } from "@/lib/stores";
import type { MenuItem, ModifierGroup, ModifierOption } from "@/types/database";
import {
  PRODUCT_IMAGE_ACCEPT,
  removeManagedProductImage,
  uploadProductImage,
  validateProductImage,
} from "@/lib/product-images";

interface ProductFormModalProps {
  item?: MenuItem | null;
  categoryId: string;
  onClose: () => void;
}

export function ProductFormModal({ item, categoryId, onClose }: ProductFormModalProps) {
  const { categories, createMenuItem, updateMenuItem } = useCatalogStore();
  const [activeTab, setActiveTab] = useState<"info" | "modifiers">("info");
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.category_id ?? categoryId);
  const [modifiers, setModifiers] = useState<ModifierGroup[]>(
    Array.isArray(item?.modifiers) ? item.modifiers : []
  );
  const [saving, setSaving] = useState(false);

  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview]
  );

  function selectImage(file: File | null) {
    if (!file) return;
    const validation = validateProductImage(file);
    if (validation) {
      toast.error(validation);
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    setRemoveImage(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericPrice = Number(price);
    if (
      !name.trim() ||
      !price ||
      !Number.isFinite(numericPrice) ||
      numericPrice < 0 ||
      !selectedCategoryId
    ) {
      toast.error("Completa nombre, precio y categoría");
      return;
    }

    const normalizedModifiers = modifiers.map((group) => {
      const selectionMode: NonNullable<ModifierGroup["selection_mode"]> =
        group.selection_mode === "multiple" ? "multiple" : "single";
      const options = group.options.map((option) => ({
        id: option.id ?? crypto.randomUUID(),
        name: option.name.trim(),
        price: Math.max(0, Number(option.price) || 0),
        description: option.description?.trim() || "",
      }));
      const requestedMaximum = Math.floor(Number(group.max_selections) || 0);

      return {
        id: group.id ?? crypto.randomUUID(),
        name: group.name.trim(),
        required: Boolean(group.required),
        selection_mode: selectionMode,
        min_selections: group.required ? 1 : 0,
        max_selections:
          selectionMode === "single"
            ? 1
            : requestedMaximum > 0
              ? Math.min(requestedMaximum, options.length)
              : null,
        options,
      };
    });

    if (
      normalizedModifiers.some(
        (group) =>
          !group.name ||
          group.options.length === 0 ||
          group.options.some((option) => !option.name)
      )
    ) {
      toast.error("Completa el nombre y las opciones de cada variación");
      setActiveTab("modifiers");
      return;
    }

    const data = {
      name: name.trim(),
      price: numericPrice,
      description: description.trim(),
      category_id: selectedCategoryId,
      modifiers: normalizedModifiers,
      image_url: removeImage ? "" : item?.image_url ?? "",
      is_active: item?.is_active ?? true,
      sort_order: item?.sort_order ?? 0,
    };

    setSaving(true);
    try {
      const created = item ? null : await createMenuItem(data);
      const saved = item ? await updateMenuItem(item.id, data) : Boolean(created);

      if (!saved) {
        toast.error("No se pudo guardar el producto", {
          description: "Revisa tu conexión o permisos de administrador.",
        });
        return;
      }

      const productId = item?.id ?? created?.id;
      if (!productId) throw new Error("No se encontró el producto guardado.");

      if (imageFile) {
        const nextUrl = await uploadProductImage(productId, imageFile);
        const imageSaved = await updateMenuItem(productId, { image_url: nextUrl });
        if (!imageSaved) {
          await removeManagedProductImage(nextUrl).catch(() => undefined);
          throw new Error("El producto se guardó, pero no se pudo enlazar la imagen.");
        }
        if (item?.image_url) {
          await removeManagedProductImage(item.image_url).catch(() => undefined);
        }
      } else if (removeImage && item?.image_url) {
        await removeManagedProductImage(item.image_url).catch(() => undefined);
      }

      toast.success(item ? "Producto actualizado" : "Producto creado", {
        description: imageFile ? "La imagen se optimizó y quedó lista para el menú." : undefined,
      });
      onClose();
    } catch (error) {
      toast.error("No se pudo guardar el producto", {
        description:
          error instanceof Error
            ? error.message
            : "Revisa tu conexión o permisos de administrador.",
      });
    } finally {
      setSaving(false);
    }
  }

  function addModifierGroup() {
    setModifiers([
      ...modifiers,
      {
        id: crypto.randomUUID(),
        name: "",
        required: false,
        selection_mode: "single",
        min_selections: 0,
        max_selections: 1,
        options: [],
      },
    ]);
  }

  function updateModifierGroup(index: number, updates: Partial<ModifierGroup>) {
    setModifiers(
      modifiers.map((m, i) => (i === index ? { ...m, ...updates } : m))
    );
  }

  function removeModifierGroup(index: number) {
    setModifiers(modifiers.filter((_, i) => i !== index));
  }

  function addOption(groupIndex: number) {
    setModifiers(
      modifiers.map((m, i) =>
        i === groupIndex
          ? { ...m, options: [...m.options, { id: crypto.randomUUID(), name: "", price: 0 }] }
          : m
      )
    );
  }

  function updateOption(
    groupIndex: number,
    optionIndex: number,
    updates: Partial<ModifierOption>
  ) {
    setModifiers(
      modifiers.map((m, i) =>
        i === groupIndex
          ? {
              ...m,
              options: m.options.map((o, j) =>
                j === optionIndex ? { ...o, ...updates } : o
              ),
            }
          : m
      )
    );
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    setModifiers(
      modifiers.map((m, i) =>
        i === groupIndex
          ? { ...m, options: m.options.filter((_, j) => j !== optionIndex) }
          : m
      )
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="flex h-dvh w-full max-w-2xl flex-col overflow-hidden border-border bg-card sm:h-[min(90vh,760px)] sm:rounded-2xl sm:border sm:shadow-float"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <h2 id="product-form-title" className="font-heading text-base font-bold text-foreground sm:text-lg">
            {item ? "Editar producto" : "Nuevo producto"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
            aria-label="Cerrar editor"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-4 py-2 sm:px-6 sm:py-3">
          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-4 py-2 font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer sm:flex-none ${
              activeTab === "info"
                ? "bg-brand text-white"
                : "bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            Info básica
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("modifiers")}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-4 py-2 font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer sm:flex-none ${
              activeTab === "modifiers"
                ? "bg-brand text-white"
                : "bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            Variaciones
            {modifiers.length > 0 ? (
              <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] text-brand">
                {modifiers.length}
              </span>
            ) : null}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="pos-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 sm:p-6">
            {activeTab === "info" ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="min-h-11 rounded-xl border border-border bg-surface px-3 font-body text-base text-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Precio
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    min="0"
                    step="1"
                    className="min-h-11 rounded-xl border border-border bg-surface px-3 font-data text-base text-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Descripción
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="min-h-24 rounded-xl border border-border bg-surface px-3 py-2 font-body text-base text-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Imagen del producto
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT}
                    onChange={(event) => selectImage(event.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  {imagePreview || (!removeImage && item?.image_url) ? (
                    <div className="relative overflow-hidden rounded-2xl border border-border bg-background">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview || item?.image_url || ""}
                        alt={`Vista previa de ${name || "producto"}`}
                        className="aspect-[4/3] w-full object-cover sm:max-h-64"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-ink/80 p-3">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white/12 font-heading text-xs font-bold text-white hover:bg-white/20">
                          <Upload size={15} />Cambiar
                        </button>
                        <button type="button" onClick={clearImage} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-destructive px-4 font-heading text-xs font-bold text-white hover:bg-destructive/85">
                          <Trash2 size={15} />Quitar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/50 px-5 text-center transition-colors hover:border-brand/60 hover:bg-brand-light"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand"><ImagePlus size={22} /></span>
                      <span className="font-heading text-sm font-bold">Elegir foto del dispositivo</span>
                      <span className="font-body text-xs text-muted-foreground">JPG, PNG, WebP o HEIC · máximo 8 MB</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Categoría
                  </label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="min-h-11 rounded-xl border border-border bg-surface px-3 font-body text-base text-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:text-sm"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <p className="font-body text-sm leading-6 text-muted-foreground">
                    Agrega grupos de variaciones, como Sabor, Toppings o Extras.
                  </p>
                  <button
                    type="button"
                    onClick={addModifierGroup}
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 font-heading text-xs font-bold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer sm:w-auto"
                  >
                    <Plus size={14} />
                    Agregar grupo
                  </button>
                </div>

                {modifiers.map((group, groupIndex) => (
                  <div
                    key={groupIndex}
                    className="rounded-2xl border border-border bg-surface p-3 sm:p-4"
                  >
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) =>
                          updateModifierGroup(groupIndex, { name: e.target.value })
                        }
                        placeholder="Nombre del grupo (ej: Sabor)"
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-body text-base text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:text-sm"
                      />
                      <div className="flex items-center justify-between gap-2 sm:shrink-0">
                        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2 sm:flex-none">
                        <input
                          type="checkbox"
                          checked={group.required}
                          onChange={(e) =>
                            updateModifierGroup(groupIndex, {
                              required: e.target.checked,
                            })
                          }
                          className="h-5 w-5 rounded border-border accent-brand"
                        />
                        <span className="font-body text-sm text-muted-foreground">
                          Requerido
                        </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeModifierGroup(groupIndex)}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
                          title="Eliminar grupo de variaciones"
                          aria-label={`Eliminar grupo ${group.name || groupIndex + 1}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mb-3 grid gap-2 rounded-xl bg-background/55 p-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <label className="min-w-0">
                        <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">
                          Tipo de selección
                        </span>
                        <select
                          value={group.selection_mode === "multiple" ? "multiple" : "single"}
                          onChange={(event) => {
                            const selectionMode = event.target.value as "single" | "multiple";
                            updateModifierGroup(groupIndex, {
                              selection_mode: selectionMode,
                              min_selections: group.required ? 1 : 0,
                              max_selections: selectionMode === "single" ? 1 : null,
                            });
                          }}
                          className="h-11 w-full rounded-xl border border-border bg-surface px-3 font-body text-sm text-foreground outline-none focus:border-brand"
                        >
                          <option value="single">Una opción</option>
                          <option value="multiple">Varias opciones</option>
                        </select>
                      </label>
                      {group.selection_mode === "multiple" ? (
                        <label>
                          <span className="mb-1 block font-heading text-[11px] font-bold text-muted-foreground">
                            Máximo
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={Math.max(1, group.options.length)}
                            value={group.max_selections ?? ""}
                            onChange={(event) =>
                              updateModifierGroup(groupIndex, {
                                max_selections: event.target.value
                                  ? Math.max(1, Math.floor(Number(event.target.value)))
                                  : null,
                              })
                            }
                            placeholder="Sin límite"
                            className="h-11 w-full rounded-xl border border-border bg-surface px-3 font-data text-sm text-foreground outline-none placeholder:font-body placeholder:text-muted-foreground focus:border-brand"
                          />
                        </label>
                      ) : (
                        <div className="flex items-end pb-2 font-body text-xs text-muted-foreground">
                          Se reemplaza al elegir otra
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {group.options.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className="grid gap-2 rounded-xl border border-border/70 bg-background/50 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:p-2"
                        >
                          <input
                            type="text"
                            value={option.name}
                            onChange={(e) =>
                              updateOption(groupIndex, optionIndex, {
                                name: e.target.value,
                              })
                            }
                            placeholder="Opción (ej: Buffalo Ranch)"
                            className="min-h-11 min-w-0 rounded-xl border border-border bg-background px-3 font-body text-base text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:min-h-10 sm:rounded-md sm:text-sm"
                          />
                          <div className="flex min-w-0 items-center gap-2 sm:contents">
                            <input
                              type="number"
                              value={option.price}
                              onChange={(e) =>
                                updateOption(groupIndex, optionIndex, {
                                  price: Number(e.target.value),
                                })
                              }
                              min="0"
                              step="1"
                              placeholder="Precio extra"
                              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-data text-base text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:min-h-10 sm:w-full sm:rounded-md sm:text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(groupIndex, optionIndex)}
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer sm:h-10 sm:w-10 sm:rounded-md"
                              title="Eliminar opción"
                              aria-label={`Eliminar opción ${option.name || optionIndex + 1}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={option.description ?? ""}
                            onChange={(e) =>
                              updateOption(groupIndex, optionIndex, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Información (ej: queso, tocino y spicy)"
                            className="min-h-11 min-w-0 rounded-xl border border-border bg-background px-3 font-body text-base text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-light sm:min-h-10 sm:rounded-md sm:col-span-3 sm:text-xs"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(groupIndex)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 font-heading text-xs font-semibold text-muted-foreground transition-colors hover:border-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer sm:w-auto"
                      >
                        <Plus size={12} />
                        Agregar opción
                      </button>
                    </div>
                  </div>
                ))}

                {modifiers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center sm:p-8">
                    <p className="font-body text-sm text-muted-foreground">
                      No hay variaciones. Presiona Agregar grupo para crear una.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card/95 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:px-6 sm:py-4">
            <button
              type="submit"
              disabled={saving}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-2 font-heading text-sm font-bold focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer sm:min-h-11 sm:text-xs ${item ? "action-success" : "bg-brand text-white transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand"}`}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Guardando...
                </>
              ) : item ? (
                "Guardar cambios"
              ) : (
                "Crear producto"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 font-heading text-sm font-bold text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer sm:text-xs"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
