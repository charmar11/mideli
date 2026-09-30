import { Building2 } from "lucide-react";

export function RinconBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-primary-foreground">
        <Building2 size={19} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={`block truncate font-heading font-extrabold leading-tight text-foreground ${compact ? "text-base" : "text-lg"}`}>
          Rincón 404
        </span>
        {!compact ? (
          <span className="block font-body text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
            Food Park
          </span>
        ) : null}
      </span>
    </span>
  );
}
