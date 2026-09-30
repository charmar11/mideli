"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Building2, Check, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  BUSINESS_BRAND_PRESETS,
  getBusinessLogoUrl,
  getReadableBrandForeground,
  MAX_BUSINESS_LOGO_BYTES,
} from "@/lib/business-branding";

interface BusinessIdentityFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  primaryColor: string;
  accentColor: string;
  onPrimaryColorChange: (color: string) => void;
  onAccentColorChange: (color: string) => void;
  logoFile: File | null;
  onLogoFileChange: (file: File | null) => void;
  currentLogoPath?: string | null;
  removeCurrentLogoPending?: boolean;
  onRemoveCurrentLogo?: () => void;
  onRestoreCurrentLogo?: () => void;
}

export function BusinessIdentityFields({
  name,
  onNameChange,
  primaryColor,
  accentColor,
  onPrimaryColorChange,
  onAccentColorChange,
  logoFile,
  onLogoFileChange,
  currentLogoPath = null,
  removeCurrentLogoPending = false,
  onRemoveCurrentLogo,
  onRestoreCurrentLogo,
}: BusinessIdentityFieldsProps) {
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const currentLogoUrl = getBusinessLogoUrl(currentLogoPath);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const hasLogo = Boolean(logoFile || currentLogoPath);

  function chooseLogo(file: File | null) {
    if (!file) {
      setFilePreviewUrl(null);
      onLogoFileChange(null);
      return;
    }
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      toast.error("Formato de logo no compatible", {
        description: "Elige una imagen PNG, JPG o WebP.",
      });
      return;
    }
    if (file.size > MAX_BUSINESS_LOGO_BYTES) {
      toast.error("El logo supera el tamaño permitido", {
        description: "La imagen puede pesar hasta 4 MB. El sistema la optimizará al guardarla.",
      });
      return;
    }
    setFilePreviewUrl(URL.createObjectURL(file));
    onLogoFileChange(file);
  }

  function removeLogo() {
    setFilePreviewUrl(null);
    onLogoFileChange(null);
    onRemoveCurrentLogo?.();
  }

  return (
    <section aria-labelledby="business-identity-title" className="rounded-2xl border border-border bg-background/55 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <Building2 size={17} aria-hidden />
        </span>
        <div>
          <h3 id="business-identity-title" className="font-heading text-sm font-bold text-foreground">Identidad del negocio</h3>
          <p className="mt-1 font-body text-xs leading-5 text-muted-foreground">Nombre, logo y colores que verá tu equipo en este local.</p>
        </div>
      </div>

      <label className="block font-body text-xs font-semibold text-muted-foreground">
        Nombre del negocio
        <input
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Ej. Just Dipping"
          className="mt-1.5 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.78fr)]">
        <div className="min-w-0">
          <p className="font-body text-xs font-semibold text-muted-foreground">Elige un estilo o ajusta los tonos</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BUSINESS_BRAND_PRESETS.map((preset) => {
              const selected = primaryColor.toLowerCase() === preset.primary.toLowerCase() &&
                accentColor.toLowerCase() === preset.accent.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onPrimaryColorChange(preset.primary);
                    onAccentColorChange(preset.accent);
                  }}
                  className={`flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border px-2.5 text-left font-heading text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${selected ? "border-brand bg-brand-light text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                    <span className="size-4 rounded-full border border-background" style={{ backgroundColor: preset.primary }} />
                    <span className="size-4 rounded-full border border-background" style={{ backgroundColor: preset.accent }} />
                  </span>
                  <span className="truncate">{preset.name}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-2.5">
              <input
                type="color"
                aria-label="Color principal"
                value={primaryColor}
                onChange={(event) => onPrimaryColorChange(event.target.value.toUpperCase())}
                className="size-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              <span className="min-w-0">
                <span className="block font-heading text-[10px] font-bold text-foreground">Principal</span>
                <span className="block font-data text-[10px] text-muted-foreground">{primaryColor.toUpperCase()}</span>
              </span>
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-2.5">
              <input
                type="color"
                aria-label="Color de acento"
                value={accentColor}
                onChange={(event) => onAccentColorChange(event.target.value.toUpperCase())}
                className="size-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              <span className="min-w-0">
                <span className="block font-heading text-[10px] font-bold text-foreground">Acento</span>
                <span className="block font-data text-[10px] text-muted-foreground">{accentColor.toUpperCase()}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div
            className="flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: accentColor, backgroundColor: "#17141A" }}
          >
            {logoFile && filePreviewUrl ? (
              <img src={filePreviewUrl} alt="" className="size-10 shrink-0 rounded-lg bg-white/5 object-contain p-1" />
            ) : currentLogoUrl ? (
              <img src={currentLogoUrl} alt="" className="size-10 shrink-0 rounded-lg bg-white/5 object-contain p-1" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: primaryColor, color: getReadableBrandForeground(primaryColor) }}>
                <Building2 size={19} aria-hidden />
              </span>
            )}
            <span className="min-w-0 truncate font-heading text-sm font-bold text-foreground">{name.trim() || "Nombre del negocio"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-11 flex-1 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-xl border border-border px-3 font-heading text-xs font-bold text-foreground transition-colors hover:bg-surface-raised focus-within:ring-2 focus-within:ring-brand">
              <ImagePlus size={16} aria-hidden />
              {hasLogo ? "Cambiar logo" : "Subir logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  chooseLogo(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {hasLogo ? (
              <button
                type="button"
                onClick={removeCurrentLogoPending ? onRestoreCurrentLogo : removeLogo}
                className={`inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border px-3 font-heading text-xs font-bold focus-visible:outline-none focus-visible:ring-2 ${removeCurrentLogoPending ? "border-success/30 text-success hover:bg-success/10 focus-visible:ring-success" : "border-destructive/25 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive"}`}
              >
                {removeCurrentLogoPending ? <Check size={15} aria-hidden /> : <Trash2 size={15} aria-hidden />}
                {removeCurrentLogoPending ? "Conservar" : "Quitar"}
              </button>
            ) : null}
          </div>
          <p className="font-body text-[11px] leading-4 text-muted-foreground">
            {removeCurrentLogoPending ? "El logo se quitará cuando guardes los cambios." : "PNG, JPG o WebP · hasta 4 MB. Se adapta al espacio y se optimiza al guardar."}
          </p>
        </div>
      </div>
    </section>
  );
}
