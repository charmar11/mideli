import Link from "next/link";
import { MapPin } from "lucide-react";

export function AccessBrandPanel({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`relative flex overflow-hidden bg-ink text-sidebar-foreground ${compact ? "min-h-72 lg:min-h-dvh" : "min-h-[26rem] lg:min-h-dvh"}`}>
      <div className="relative z-10 flex w-full flex-col justify-between px-7 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="font-brand text-4xl text-brand sm:text-5xl">Mideli</Link>
          <span className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/45">
            Burger &amp; Sushi
          </span>
        </header>

        <div className={`${compact ? "mt-14 lg:mt-0" : "mt-16 lg:mt-0"}`}>
          <h1 className="max-w-xl text-balance font-heading text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
            {compact ? "Todo listo para comenzar el turno." : "El local completo, en una sola operación."}
          </h1>
        </div>

        <p className="mt-10 flex items-center gap-2 font-body text-xs text-sidebar-foreground/40 lg:mt-0">
          <MapPin size={14} /> C. Yaqui 404 Oriente, Cd. Obregón, Sonora
        </p>
      </div>
    </aside>
  );
}
