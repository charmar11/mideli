"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChefHat,
  Clock3,
  Mail,
  PackageSearch,
  Save,
  Send,
  Store,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  sendOwnerReportTest,
  updateOwnerReportSettings,
} from "@/lib/actions/owner-report";
import type { AnalyticsData } from "@/lib/actions/analytics";
import { formatCurrency } from "@/lib/owner-report/metrics";
import type {
  OwnerAction,
  OwnerOperationalData,
} from "@/lib/owner-report/types";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

const actionTone: Record<OwnerAction["tone"], string> = {
  danger: "border-destructive/25 bg-destructive/8 text-destructive",
  warning: "border-warning/25 bg-warning/8 text-warning",
  success: "border-success/25 bg-success/8 text-success",
  brand: "border-brand/25 bg-brand/8 text-brand",
};

function CompactMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  return (
    <div className="rounded-xl bg-surface-raised/65 p-3.5 ring-1 ring-foreground/5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-body text-xs text-muted-foreground">{label}</span>
          <span
            className={cn(
              "mt-1 block truncate font-data text-lg font-bold tabular-nums",
              tone === "warning" && "text-warning",
              tone === "danger" && "text-destructive",
              tone === "success" && "text-success"
            )}
          >
            {value}
          </span>
        </span>
        <Icon size={18} className="shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-2 line-clamp-2 font-body text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function lastRunLabel(report: OwnerOperationalData["report"]): string {
  if (!report.lastRun) return "Todavía no hay envíos registrados.";
  if (report.lastRun.status === "sent") {
    return `Último reporte enviado: ${report.lastRun.reportDate}.`;
  }
  if (report.lastRun.status === "failed") {
    return `El envío de ${report.lastRun.reportDate} falló y puede reintentarse.`;
  }
  return `Preparando el reporte de ${report.lastRun.reportDate}.`;
}

export function OwnerDailyControl({
  analytics,
  operation,
}: {
  analytics: AnalyticsData;
  operation: OwnerOperationalData;
}) {
  const [enabled, setEnabled] = useState(operation.report.enabled);
  const [email, setEmail] = useState(operation.report.recipientEmail);
  const [isSaving, startSaving] = useTransition();
  const [isSending, startSending] = useTransition();
  const averageKitchen =
    operation.kitchen.averageMinutes === null
      ? "Sin datos"
      : `${number.format(operation.kitchen.averageMinutes)} min`;
  const lowestMargin = operation.menu.lowestMargins[0];
  const highestMargin = operation.menu.highestMargins[0];

  function saveSettings() {
    startSaving(async () => {
      const result = await updateOwnerReportSettings({
        enabled,
        recipientEmail: email,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Reporte diario actualizado");
    });
  }

  function sendTest() {
    startSending(async () => {
      const result = await sendOwnerReportTest({
        recipientEmail: email,
        reportDate: operation.period.to,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Vista previa enviada");
    });
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
      <Card className="gap-0 overflow-hidden rounded-2xl py-0">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-data text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
                Control del dueño
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold">Qué requiere atención</h2>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Una lectura breve de ventas, caja, cocina e inventario.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-gold-light px-3 py-2 font-data text-xs font-bold text-gold">
              <Store size={15} />
              {formatCurrency(analytics.summary.revenue.current)}
            </span>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {operation.actions.map((action) => {
              const content = (
                <>
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl border",
                      actionTone[action.tone]
                    )}
                  >
                    {action.tone === "success" ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <AlertTriangle size={17} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading text-sm font-bold">{action.title}</span>
                    <span className="mt-1 block font-body text-xs leading-4 text-muted-foreground">
                      {action.detail}
                    </span>
                  </span>
                </>
              );

              return action.href ? (
                <Link
                  key={action.id}
                  href={action.href}
                  className="flex min-h-24 gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-brand/40 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={action.id}
                  className="flex min-h-24 gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  {content}
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <CompactMetric
              icon={WalletCards}
              label="Diferencia de caja"
              value={formatCurrency(operation.cash.difference)}
              detail={`${operation.cash.closedShifts} cortes cerrados`}
              tone={Math.abs(operation.cash.difference) > 0.009 ? "danger" : "success"}
            />
            <CompactMetric
              icon={ChefHat}
              label="Promedio en cocina"
              value={averageKitchen}
              detail={`${operation.kitchen.delayedOrders} pedidos con demora`}
              tone={operation.kitchen.delayedOrders > 0 ? "warning" : "default"}
            />
            <CompactMetric
              icon={PackageSearch}
              label="Insumos bajos"
              value={String(operation.inventory.lowStockItems)}
              detail={
                operation.inventory.lowStockNames.slice(0, 2).join(", ") ||
                "Sin faltantes configurados"
              }
              tone={operation.inventory.lowStockItems > 0 ? "warning" : "success"}
            />
            <CompactMetric
              icon={Calculator}
              label="Recetas pendientes"
              value={String(operation.menu.missingRecipes)}
              detail={`${operation.menu.configuredRecipes} productos con costo estimado`}
              tone={operation.menu.missingRecipes > 0 ? "warning" : "success"}
            />
          </div>

          <div className="mt-4 grid gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-3">
            <div>
              <p className="font-body text-[11px] text-muted-foreground">Margen a revisar</p>
              <p className="mt-1 truncate font-heading text-sm font-bold">
                {lowestMargin
                  ? `${lowestMargin.name} · ${number.format(lowestMargin.marginPercent ?? 0)}%`
                  : "Completa las recetas"}
              </p>
            </div>
            <div>
              <p className="font-body text-[11px] text-muted-foreground">Mejor margen estimado</p>
              <p className="mt-1 truncate font-heading text-sm font-bold text-success">
                {highestMargin
                  ? `${highestMargin.name} · ${number.format(highestMargin.marginPercent ?? 0)}%`
                  : "Sin datos todavía"}
              </p>
            </div>
            <div>
              <p className="font-body text-[11px] text-muted-foreground">Sin ventas en el periodo</p>
              <p className="mt-1 truncate font-heading text-sm font-bold">
                {operation.menu.productsWithoutSales > 0
                  ? `${operation.menu.productsWithoutSales} productos`
                  : "Todos tuvieron movimiento"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-2xl py-0">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold">Reporte cada mañana</h2>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                El dueño recibe el resumen del día anterior por correo.
              </p>
            </div>
            <Mail size={20} className="shrink-0 text-brand" />
          </div>

          <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            <span>
              <span className="block font-heading text-sm font-bold">Envío automático</span>
              <span className="block font-body text-xs text-muted-foreground">
                Una vez al día
              </span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-5 accent-brand"
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1.5 block font-heading text-xs font-bold">Correo del dueño</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="dueno@negocio.com"
              autoComplete="email"
              className="h-12 rounded-xl"
            />
          </label>

          <p className="mt-3 font-body text-xs leading-4 text-muted-foreground">
            {lastRunLabel(operation.report)}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={sendTest}
              disabled={isSending || !email.trim()}
              className="h-11 rounded-xl font-heading font-bold"
            >
              <Send />
              {isSending ? "Enviando" : "Enviar prueba"}
            </Button>
            <Button
              type="button"
              onClick={saveSettings}
              disabled={isSaving}
              className="h-11 rounded-xl bg-success font-heading font-bold text-ink hover:bg-success/90"
            >
              <Save />
              {isSaving ? "Guardando" : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
