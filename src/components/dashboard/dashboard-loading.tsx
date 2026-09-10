type DashboardLoadingProps = {
  variant: "cocina" | "mesero" | "whatsapp";
};

const loadingCopy = {
  cocina: {
    label: "Cargando cocina",
    titleWidth: "w-44",
  },
  mesero: {
    label: "Cargando punto de venta",
    titleWidth: "w-52",
  },
  whatsapp: {
    label: "Cargando WhatsApp",
    titleWidth: "w-48",
  },
} as const;

function Placeholder({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-surface-raised ${className}`} />;
}

export function DashboardLoading({ variant }: DashboardLoadingProps) {
  const copy = loadingCopy[variant];

  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-background p-3 sm:p-5"
      aria-busy="true"
      aria-label={copy.label}
    >
      <div className="mx-auto flex h-full min-h-0 max-w-[1600px] animate-pulse flex-col gap-4">
        <div className="flex shrink-0 items-center justify-between gap-4">
          <div className="space-y-2">
            <Placeholder className={`h-8 ${copy.titleWidth}`} />
            <Placeholder className="h-4 w-64 max-w-[55vw] bg-surface-raised/70" />
          </div>
          <Placeholder className="h-11 w-28 shrink-0" />
        </div>

        <div className="flex shrink-0 gap-2 overflow-hidden">
          <Placeholder className="h-11 w-32 shrink-0" />
          <Placeholder className="h-11 w-36 shrink-0" />
          <Placeholder className="h-11 w-32 shrink-0" />
          <Placeholder className="h-11 w-28 shrink-0" />
        </div>

        {variant === "whatsapp" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
            <Placeholder className="min-h-56 rounded-2xl bg-card ring-1 ring-foreground/10" />
            <Placeholder className="min-h-96 rounded-2xl bg-card ring-1 ring-foreground/10" />
          </div>
        ) : variant === "cocina" ? (
          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Placeholder className="min-h-72 rounded-2xl bg-card ring-1 ring-foreground/10" />
            <Placeholder className="min-h-72 rounded-2xl bg-card ring-1 ring-foreground/10" />
            <Placeholder className="min-h-72 rounded-2xl bg-card ring-1 ring-foreground/10" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
            <div className="grid min-h-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Placeholder className="min-h-52 rounded-2xl bg-card ring-1 ring-foreground/10" />
              <Placeholder className="min-h-52 rounded-2xl bg-card ring-1 ring-foreground/10" />
              <Placeholder className="min-h-52 rounded-2xl bg-card ring-1 ring-foreground/10" />
              <Placeholder className="min-h-52 rounded-2xl bg-card ring-1 ring-foreground/10" />
            </div>
            <Placeholder className="min-h-72 rounded-2xl bg-card ring-1 ring-foreground/10" />
          </div>
        )}
      </div>
    </div>
  );
}
