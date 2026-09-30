import type { CSSProperties } from "react";

export const BUSINESS_BRAND_ASSET_BUCKET = "business-brand-assets";
export const MAX_BUSINESS_LOGO_BYTES = 4 * 1024 * 1024;

export const PLATFORM_BRAND_COLORS = {
  primary: "#36C275",
  accent: "#F6DDA4",
} as const;

export const BUSINESS_BRAND_PRESETS = [
  { name: "Cítrico", primary: "#FFD500", accent: "#FFD500" },
  { name: "Frambuesa", primary: "#F5145F", accent: "#F6DDA4" },
  { name: "Menta", primary: "#36C275", accent: "#F6DDA4" },
  { name: "Azul", primary: "#4D9DE0", accent: "#F6DDA4" },
] as const;

export type BusinessBrandColors = {
  primary: string;
  accent: string;
};

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function getBusinessBrandColors(
  slug: string,
  primaryColor?: string | null,
  accentColor?: string | null,
): BusinessBrandColors {
  const normalizedSlug = slug.trim().toLowerCase();
  const defaults = normalizedSlug === "mideli"
    ? { primary: "#F5145F", accent: "#F6DDA4" }
    : normalizedSlug === "just-dipping"
      ? { primary: "#FFD500", accent: "#FFD500" }
      : PLATFORM_BRAND_COLORS;

  return {
    primary: primaryColor && isHexColor(primaryColor) ? primaryColor : defaults.primary,
    accent: accentColor && isHexColor(accentColor) ? accentColor : defaults.accent,
  };
}

function linearizeChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const red = linearizeChannel(Number.parseInt(color.slice(1, 3), 16));
  const green = linearizeChannel(Number.parseInt(color.slice(3, 5), 16));
  const blue = linearizeChannel(Number.parseInt(color.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getReadableBrandForeground(color: string) {
  const normalized = isHexColor(color) ? color : PLATFORM_BRAND_COLORS.primary;
  const lightContrast = 1.05 / (luminance(normalized) + 0.05);
  const darkContrast = (luminance(normalized) + 0.05) / 0.05;
  return darkContrast > lightContrast ? "#111014" : "#FBF8E7";
}

export function getBusinessLogoUrl(path: string | null | undefined) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl || !path) return null;
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/${BUSINESS_BRAND_ASSET_BUCKET}/${safePath}`;
}

export function getBrandThemeVariables(colors: BusinessBrandColors) {
  const foreground = getReadableBrandForeground(colors.primary);
  const light = `color-mix(in srgb, ${colors.primary} 16%, transparent)`;
  return {
    "--brand": colors.primary,
    "--brand-hover": `color-mix(in srgb, ${colors.primary} 88%, white)`,
    "--brand-light": light,
    "--brand-accent": colors.accent,
    "--primary": colors.primary,
    "--primary-foreground": foreground,
    "--ring": colors.accent,
    "--sidebar-primary": colors.primary,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-ring": colors.accent,
    "--sidebar-accent": light,
    "--chart-1": colors.primary,
  } as CSSProperties;
}
