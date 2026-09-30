import { ShieldAlert } from "lucide-react";

export default function SinAccesoPage() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto px-5 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
          <ShieldAlert aria-hidden size={24} />
        </div>
        <p className="mt-5 font-data text-[10px] font-bold uppercase tracking-[0.2em] text-warning">
          Acceso operativo
        </p>
        <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
          Tu sesión sigue abierta
        </h1>
        <p className="mt-3 font-body text-sm leading-6 text-muted-foreground">
          Esta cuenta no tiene permisos activos para la sección solicitada. No
          cerramos tu sesión; pide al dueño o al coordinador que revise tus
          accesos.
        </p>
      </section>
    </div>
  );
}
