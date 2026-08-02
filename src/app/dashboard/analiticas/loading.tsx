export default function AnaliticasLoading() {
  return (
    <div className="h-full overflow-hidden p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1480px] animate-pulse space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="h-8 w-56 rounded-lg bg-surface-raised" />
            <div className="h-4 w-80 max-w-full rounded bg-surface-raised/70" />
          </div>
          <div className="h-12 w-full rounded-xl bg-surface-raised sm:w-96" />
        </div>
        <div className="h-12 rounded-xl bg-surface" />
        <div className="analytics-split-grid analytics-split-grid-wide">
          <div className="h-[34rem] rounded-2xl bg-card ring-1 ring-foreground/10" />
          <div className="h-[34rem] rounded-2xl bg-card ring-1 ring-foreground/10" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-96 rounded-2xl bg-card ring-1 ring-foreground/10" />
          <div className="h-96 rounded-2xl bg-card ring-1 ring-foreground/10" />
        </div>
      </div>
    </div>
  );
}
