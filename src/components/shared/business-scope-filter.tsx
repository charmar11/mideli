"use client";

import { Building2 } from "lucide-react";
import type { BusinessContextRow } from "@/types/multibusiness";

export const ALL_BUSINESSES_FILTER = "all";

interface BusinessScopeFilterProps {
  businesses: BusinessContextRow[];
  value: string;
  onChange: (businessId: string) => void;
  className?: string;
  label?: string;
}

/**
 * Local view filter only. Authorization still comes from Supabase/RLS; this
 * control never changes the user's memberships or grants access to a business.
 */
export function BusinessScopeFilter({
  businesses,
  value,
  onChange,
  className = "",
  label = "Negocio",
}: BusinessScopeFilterProps) {
  if (businesses.length <= 1) return null;

  return (
    <label
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-muted-foreground focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 ${className}`}
    >
      <Building2 size={15} className="shrink-0 text-brand" aria-hidden="true" />
      <span className="sr-only">Filtrar por {label.toLowerCase()}</span>
      <select
        aria-label={`Filtrar por ${label.toLowerCase()}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-32 max-w-56 cursor-pointer bg-transparent font-heading text-xs font-bold text-foreground outline-none"
      >
        <option value={ALL_BUSINESSES_FILTER}>Todos los negocios</option>
        {businesses.map((business) => (
          <option key={business.business_id} value={business.business_id}>
            {business.business_display_name}
            {business.business_lifecycle_status === "draft"
              ? " · borrador"
              : business.business_lifecycle_status === "paused"
                ? " · pausado"
                : business.business_lifecycle_status === "archived"
                  ? " · archivado"
                  : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
