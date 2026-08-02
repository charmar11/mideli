import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";

export function formatInventoryNumber(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);
}

export function formatInventoryMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

export function InventoryPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface shadow-card ${className}`}>
      {title || description || action ? (
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="font-heading text-sm font-bold text-foreground sm:text-base">{title}</h2> : null}
            {description ? <p className="mt-1 font-body text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function InventoryEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center">
      <PackageOpen size={28} className="mb-3 text-muted-foreground/45" />
      <p className="font-heading text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm font-body text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StockStatus({ current, minimum }: { current: number; minimum: number }) {
  const empty = current <= 0;
  const low = !empty && current <= minimum;
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 font-heading text-[10px] font-bold ${
        empty
          ? "bg-destructive/12 text-destructive"
          : low
            ? "bg-warning-light text-warning"
            : "bg-success/10 text-success"
      }`}
    >
      {empty ? "Agotado" : low ? "Stock bajo" : "Disponible"}
    </span>
  );
}
