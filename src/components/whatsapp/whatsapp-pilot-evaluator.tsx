"use client";

import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runWhatsappPilotBatchAction } from "@/lib/actions/whatsapp";
import type {
  WhatsappPilotBatchResult,
  WhatsappPilotScenarioResult,
} from "@/lib/whatsapp/pilot-evaluator-types";

const TOTAL_BATCHES = 5;

function statusLabel(status: WhatsappPilotScenarioResult["status"]) {
  if (status === "passed") return "Correcto";
  if (status === "review") return "Revisar";
  return "Falló";
}

export function WhatsappPilotEvaluator() {
  const [batches, setBatches] = useState<WhatsappPilotBatchResult[]>([]);
  const [running, setRunning] = useState(false);
  const [fatalError, setFatalError] = useState("");

  const results = useMemo(
    () => batches.flatMap((batch) => batch.results),
    [batches]
  );
  const passed = results.filter((item) => item.status === "passed").length;
  const review = results.filter((item) => item.status === "review").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const critical = results.filter((item) => item.critical).length;
  const finished = batches.length === TOTAL_BATCHES && !running;
  const averageDuration = results.length
    ? Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / results.length)
    : 0;
  const longestDuration = results.length
    ? Math.max(...results.map((item) => item.durationMs))
    : 0;
  const needsAttention = results.filter((item) => item.status !== "passed");

  async function runEvaluation() {
    setRunning(true);
    setBatches([]);
    setFatalError("");
    try {
      for (let batchIndex = 0; batchIndex < TOTAL_BATCHES; batchIndex += 1) {
        const response = await runWhatsappPilotBatchAction(batchIndex);
        if (!response.success) throw new Error(response.error);
        setBatches((current) => [...current, response.data]);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo completar la evaluación";
      setFatalError(detail);
      toast.error(detail);
    } finally {
      setRunning(false);
    }
  }

  const completedScenarios = results.length;
  const progress = Math.round((completedScenarios / 25) * 100);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-brand">
              <FlaskConical size={18} />
              <p className="font-heading text-xs font-bold uppercase tracking-wider">
                Piloto automatizado temporal
              </p>
            </div>
            <h3 className="mt-2 font-heading text-lg font-bold">Evaluar 25 conversaciones</h3>
            <p className="mt-1 max-w-2xl font-body text-xs text-muted-foreground">
              Revisa catálogo, cambios, notas, Gemini y dos domicilios de Maps. No envía
              mensajes, no crea pedidos y no guarda conversaciones.
            </p>
          </div>
          <Button
            type="button"
            className="h-11 shrink-0 gap-2 bg-brand text-white hover:bg-brand-hover"
            disabled={running}
            onClick={runEvaluation}
          >
            {running ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : results.length ? (
              <RotateCcw size={16} />
            ) : (
              <FlaskConical size={16} />
            )}
            {running ? "Evaluando" : results.length ? "Repetir prueba" : "Iniciar prueba"}
          </Button>
        </div>
      </div>

      {(running || results.length > 0 || fatalError) ? (
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 font-body text-xs">
              <span className="text-muted-foreground">
                {running
                  ? `Bloque ${Math.min(batches.length + 1, TOTAL_BATCHES)} de ${TOTAL_BATCHES}`
                  : `${completedScenarios} de 25 escenarios`}
              </span>
              <span className="font-data font-bold text-foreground">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {fatalError ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger">
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 shrink-0" size={16} />
                <p className="font-body text-xs">{fatalError}</p>
              </div>
            </div>
          ) : null}

          {results.length ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Correctos" value={passed} tone="text-success" />
                <Metric label="Por revisar" value={review} tone="text-warning" />
                <Metric label="Fallidos" value={failed} tone="text-danger" />
                <Metric label="Críticos" value={critical} tone={critical ? "text-danger" : "text-success"} />
              </div>

              {finished ? (
                <div
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    critical || failed
                      ? "border-danger/30 bg-danger/10 text-danger"
                      : review
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-success/30 bg-success/10 text-success"
                  }`}
                >
                  {critical || failed ? (
                    <CircleAlert className="mt-0.5 shrink-0" size={20} />
                  ) : review ? (
                    <CircleAlert className="mt-0.5 shrink-0" size={20} />
                  ) : (
                    <ShieldCheck className="mt-0.5 shrink-0" size={20} />
                  )}
                  <div className="min-w-0">
                    <p className="font-heading text-sm font-bold">
                      {critical || failed
                        ? "El piloto detectó bloqueadores"
                        : review
                          ? "El flujo funciona, pero requiere revisión"
                          : "Evaluación automatizada aprobada"}
                    </p>
                    <p className="mt-1 font-body text-xs opacity-80">
                      Promedio {averageDuration} ms por escenario. El más lento tardó {longestDuration} ms.
                    </p>
                  </div>
                </div>
              ) : null}

              {needsAttention.length ? (
                <details className="group rounded-xl border border-border bg-background">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                    <CircleAlert size={17} className="shrink-0 text-warning" />
                    <span className="min-w-0 flex-1 font-heading text-sm font-bold">
                      Ver {needsAttention.length} resultados por atender
                    </span>
                    <ChevronDown size={17} className="shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="divide-y divide-border border-t border-border">
                    {needsAttention.map((item) => (
                      <div key={item.id} className="min-w-0 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 font-heading text-[10px] font-bold uppercase ${
                              item.status === "failed"
                                ? "bg-danger/15 text-danger"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            {statusLabel(item.status)}
                          </span>
                          <span className="font-heading text-sm font-bold">{item.title}</span>
                        </div>
                        <p className="mt-1 break-words font-body text-xs text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : finished ? (
                <div className="flex items-center gap-2 rounded-xl bg-background p-4 text-success">
                  <CheckCircle2 size={17} />
                  <p className="font-body text-xs">No se detectaron resultados pendientes.</p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-background p-3">
      <p className={`font-data text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 truncate font-body text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
