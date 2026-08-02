"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTodayKey,
  parseDateKey,
  periodFromAnchor,
  periodLabel,
  shiftPeriod,
  toDateKey,
  type AnalyticsPeriod,
  type AnalyticsPeriodView,
} from "@/lib/analytics/period";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: Array<{
  id: AnalyticsPeriodView;
  short: string;
  label: string;
}> = [
  { id: "dia", short: "D", label: "Día" },
  { id: "semana", short: "S", label: "Semana" },
  { id: "mes", short: "M", label: "Mes" },
  { id: "anio", short: "A", label: "Año" },
];

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

interface DateRangePickerProps {
  period: AnalyticsPeriod;
}

function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

function calendarDays(displayMonth: Date): Date[] {
  const first = new Date(
    displayMonth.getFullYear(),
    displayMonth.getMonth(),
    1,
    12
  );
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function actionLabel(view: AnalyticsPeriodView): string {
  return {
    dia: "Ver este día",
    semana: "Ver esta semana",
    mes: "Ver este mes",
    anio: "Ver este año",
  }[view];
}

function viewContextLabel(view: AnalyticsPeriodView): string {
  return {
    dia: "Día",
    semana: "Semana",
    mes: "Mes",
    anio: "Año",
  }[view];
}

export function DateRangePicker({ period }: DateRangePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(period);
  const [displayMonth, setDisplayMonth] = useState(() =>
    parseDateKey(period.from)
  );
  const todayKey = getTodayKey();
  const today = useMemo(() => parseDateKey(todayKey), [todayKey]);
  const days = useMemo(() => calendarDays(displayMonth), [displayMonth]);
  const selectedFrom = parseDateKey(draft.from);
  const yearBlockStart = Math.floor(displayMonth.getFullYear() / 12) * 12;

  function navigate(next: AnalyticsPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vista", next.view);
    params.set("desde", next.from);
    params.set("hasta", next.to);
    startTransition(() => {
      router.push(`/dashboard/analiticas?${params.toString()}`, { scroll: false });
    });
  }

  function openPicker() {
    setDraft(period);
    setDisplayMonth(parseDateKey(period.from));
    dialogRef.current?.showModal();
  }

  function closePicker() {
    dialogRef.current?.close();
  }

  function chooseView(view: AnalyticsPeriodView, applyImmediately = false) {
    const anchor = applyImmediately ? parseDateKey(period.from) : parseDateKey(draft.from);
    const next = periodFromAnchor(view, anchor, today);
    setDraft(next);
    setDisplayMonth(parseDateKey(next.from));
    if (applyImmediately) navigate(next);
  }

  function chooseAnchor(date: Date) {
    if (date > today) return;
    const next = periodFromAnchor(draft.view, date, today);
    setDraft(next);
    setDisplayMonth(date);
  }

  function applyDraft() {
    navigate(draft);
    closePicker();
  }

  function jumpToCurrent() {
    const next = periodFromAnchor(draft.view, today, today);
    setDraft(next);
    setDisplayMonth(today);
  }

  const canGoNext = period.to < todayKey;
  const dialogTitle =
    draft.view === "anio"
      ? `${yearBlockStart} a ${yearBlockStart + 11}`
      : draft.view === "mes"
        ? String(displayMonth.getFullYear())
        : new Intl.DateTimeFormat("es-MX", {
            month: "long",
            year: "numeric",
          }).format(displayMonth);

  return (
    <div className="analytics-period-picker">
      <div className="analytics-period-main flex items-center rounded-xl bg-surface-raised p-1 ring-1 ring-foreground/10">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="h-11 w-10 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
          onClick={() => navigate(shiftPeriod(period, -1, today))}
          disabled={isPending}
          aria-label="Periodo anterior"
        >
          <ChevronLeft />
        </Button>

        <button
          type="button"
          onClick={openPicker}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg bg-card px-3 text-left ring-1 ring-foreground/10 transition-[background-color,transform] duration-150 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:min-w-48"
          aria-haspopup="dialog"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
            <CalendarDays size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-[10px] font-bold uppercase tracking-[0.08em] text-brand">
              {viewContextLabel(period.view)}
            </span>
            <span className="block truncate font-heading text-sm font-semibold capitalize text-foreground">
              {periodLabel(period)}
            </span>
          </span>
          <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="h-11 w-10 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
          onClick={() => navigate(shiftPeriod(period, 1, today))}
          disabled={!canGoNext || isPending}
          aria-label="Periodo siguiente"
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="analytics-period-modes grid grid-cols-4 rounded-xl bg-surface-raised p-1 ring-1 ring-foreground/10">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => chooseView(option.id, true)}
            aria-label={`Ver por ${option.label.toLowerCase()}`}
            aria-pressed={period.view === option.id}
            className={cn(
              "flex h-11 min-w-11 items-center justify-center rounded-lg font-heading text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              period.view === option.id
                ? "bg-brand text-white shadow-sm"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            )}
          >
            {option.short}
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="analytics-period-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) closePicker();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-2xl bg-surface p-0 text-foreground shadow-float ring-1 ring-foreground/15 backdrop:bg-black/75"
      >
        <div className="pos-scroll max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="analytics-period-title" className="font-heading text-lg font-bold">
                Elegir periodo
              </h2>
              <p className="font-body text-sm text-muted-foreground">
                Cambia la escala y toca la fecha que quieres revisar.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={closePicker}
              aria-label="Cerrar selector"
              className="shrink-0 rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
            >
              <X />
            </Button>
          </div>

          <div className="mb-4 grid grid-cols-4 rounded-xl bg-surface-raised p-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseView(option.id)}
                aria-pressed={draft.view === option.id}
                className={cn(
                  "h-11 rounded-lg font-heading text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  draft.view === option.id
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                )}
              >
                {option.short}
                <span className="sr-only">{option.label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
            <div className="mb-3 grid grid-cols-[44px_1fr_44px] items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                onClick={() => {
                  const next = new Date(displayMonth);
                  if (draft.view === "anio") next.setFullYear(next.getFullYear() - 12);
                  else if (draft.view === "mes") next.setFullYear(next.getFullYear() - 1);
                  else next.setMonth(next.getMonth() - 1);
                  setDisplayMonth(next);
                }}
                aria-label="Anterior"
              >
                <ChevronLeft />
              </Button>
              <p className="text-center font-heading text-sm font-bold uppercase capitalize">
                {dialogTitle}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="rounded-xl text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                onClick={() => {
                  const next = new Date(displayMonth);
                  if (draft.view === "anio") next.setFullYear(next.getFullYear() + 12);
                  else if (draft.view === "mes") next.setFullYear(next.getFullYear() + 1);
                  else next.setMonth(next.getMonth() + 1);
                  setDisplayMonth(next);
                }}
                disabled={
                  draft.view === "anio"
                    ? yearBlockStart + 12 > today.getFullYear()
                    : draft.view === "mes"
                      ? displayMonth.getFullYear() >= today.getFullYear()
                      : new Date(
                            displayMonth.getFullYear(),
                            displayMonth.getMonth() + 1,
                            1,
                            12
                          ) > today
                }
                aria-label="Siguiente"
              >
                <ChevronRight />
              </Button>
            </div>

            {draft.view === "dia" || draft.view === "semana" ? (
              <>
                <div className="mb-1 grid grid-cols-7">
                  {WEEKDAYS.map((day) => (
                    <span
                      key={day}
                      className="flex h-8 items-center justify-center font-heading text-[10px] font-bold text-muted-foreground"
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {days.map((date) => {
                    const key = toDateKey(date);
                    const inMonth = date.getMonth() === displayMonth.getMonth();
                    const inRange = key >= draft.from && key <= draft.to;
                    const selected =
                      draft.view === "dia"
                        ? isSameDay(date, selectedFrom)
                        : key === draft.to;
                    const future = date > today;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={future}
                        onClick={() => chooseAnchor(date)}
                        aria-pressed={selected}
                        className={cn(
                          "mx-auto flex size-10 items-center justify-center rounded-xl font-data text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-20",
                          !inMonth && "text-muted-foreground/45",
                          inRange && draft.view === "semana" && "bg-brand-light text-brand",
                          selected
                            ? "bg-brand text-white shadow-sm"
                            : "hover:bg-surface-raised hover:text-foreground"
                        )}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {draft.view === "mes" ? (
              <div className="grid grid-cols-3 gap-2 py-2">
                {MONTHS.map((month, index) => {
                  const date = new Date(displayMonth.getFullYear(), index, 1, 12);
                  const selected =
                    selectedFrom.getFullYear() === date.getFullYear() &&
                    selectedFrom.getMonth() === index;
                  const future = date > today;
                  return (
                    <button
                      key={month}
                      type="button"
                      disabled={future}
                      onClick={() => chooseAnchor(date)}
                      aria-pressed={selected}
                      className={cn(
                        "h-12 rounded-xl font-heading text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-20",
                        selected
                          ? "bg-brand text-white shadow-sm"
                          : "hover:bg-surface-raised"
                      )}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {draft.view === "anio" ? (
              <div className="grid grid-cols-3 gap-2 py-2">
                {Array.from({ length: 12 }, (_, index) => yearBlockStart + index).map(
                  (year) => {
                    const selected = selectedFrom.getFullYear() === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        disabled={year > today.getFullYear()}
                        onClick={() => chooseAnchor(new Date(year, 0, 1, 12))}
                        aria-pressed={selected}
                        className={cn(
                          "h-12 rounded-xl font-data text-xs font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-20",
                          selected
                            ? "bg-brand text-white shadow-sm"
                            : "hover:bg-surface-raised"
                        )}
                      >
                        {year}
                      </button>
                    );
                  }
                )}
              </div>
            ) : null}

            <div className="mt-4 border-t border-border pt-4">
              <button
                type="button"
                onClick={jumpToCurrent}
                className="h-10 w-full rounded-xl bg-surface-raised font-heading text-xs font-bold text-foreground transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Ir al periodo actual
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 flex-1 rounded-xl font-heading font-bold text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              onClick={closePicker}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-11 flex-[1.4] rounded-xl bg-brand font-heading font-bold text-white hover:bg-brand-hover"
              onClick={applyDraft}
            >
              {actionLabel(draft.view)}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
