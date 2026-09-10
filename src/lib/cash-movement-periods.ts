import type { CashMovementRecord, CashMovementType } from "@/types/cash";
import { BUSINESS_TIME_ZONE, getTodayKey } from "@/lib/date-period";

export const CASH_TIME_ZONE = BUSINESS_TIME_ZONE;

export interface CashPeriodSummary {
  count: number;
  expenses: number;
  withdrawals: number;
  funds: number;
}

export interface CashDayGroup {
  key: string;
  inMonth: boolean;
  movements: CashMovementRecord[];
  summary: CashPeriodSummary;
}

export interface CashWeekGroup {
  key: string;
  startKey: string;
  endKey: string;
  days: CashDayGroup[];
  summary: CashPeriodSummary;
}

const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CASH_TIME_ZONE,
  calendar: "gregory",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const displayDateFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const displayMonthFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function partsForDate(value: Date) {
  return Object.fromEntries(
    datePartsFormatter.formatToParts(value).map(({ type, value: partValue }) => [type, Number(partValue)])
  ) as Record<string, number>;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function localDateTimeToUtc(key: string, hour = 0) {
  const { year, month, day } = parseDateKey(key);
  const desiredUtcLike = Date.UTC(year, month - 1, day, hour);
  const guess = new Date(desiredUtcLike);
  const actual = partsForDate(guess);
  const actualUtcLike = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  return new Date(desiredUtcLike + desiredUtcLike - actualUtcLike);
}

export function businessDateKey(value: string | Date) {
  const parts = partsForDate(value instanceof Date ? value : new Date(value));
  return dateKeyFromParts(parts.year, parts.month, parts.day);
}

export function businessMonthKey(value: string | Date) {
  return businessDateKey(value).slice(0, 7);
}

export function currentBusinessMonth() {
  return getTodayKey().slice(0, 7);
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return displayMonthFormatter.format(new Date(Date.UTC(year, month - 1, 15)));
}

export function dateLabel(dateKey: string, options?: Intl.DateTimeFormatOptions) {
  if (options) {
    return new Intl.DateTimeFormat("es-MX", { ...options, timeZone: "UTC" }).format(
      new Date(`${dateKey}T12:00:00Z`)
    );
  }
  return displayDateFormatter.format(new Date(`${dateKey}T12:00:00Z`));
}

export function monthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  return {
    since: localDateTimeToUtc(`${monthKey}-01`).toISOString(),
    until: localDateTimeToUtc(`${nextMonth}-01`).toISOString(),
  };
}

export function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function addCalendarDays(dateKey: string, amount: number) {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return dateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function mondayOfWeek(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  return addCalendarDays(dateKey, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
}

export function effectiveAmount(movement: CashMovementRecord) {
  return movement.corrected_amount ?? movement.amount;
}

export function summarizeMovements(movements: CashMovementRecord[]): CashPeriodSummary {
  return movements.reduce(
    (summary, movement) => {
      const amount = effectiveAmount(movement);
      if (movement.movement_type === "expense") summary.expenses += amount;
      if (movement.movement_type === "withdrawal") summary.withdrawals += amount;
      if (movement.movement_type === "fund_addition") summary.funds += amount;
      summary.count += 1;
      return summary;
    },
    { count: 0, expenses: 0, withdrawals: 0, funds: 0 }
  );
}

export function monthWeeks(monthKey: string, movements: CashMovementRecord[]): CashWeekGroup[] {
  const firstDay = `${monthKey}-01`;
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = dateKeyFromParts(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const firstWeek = mondayOfWeek(firstDay);
  const lastWeek = mondayOfWeek(lastDay);
  const weeks: CashWeekGroup[] = [];

  for (let weekStart = firstWeek; weekStart <= lastWeek; weekStart = addCalendarDays(weekStart, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const key = addCalendarDays(weekStart, index);
      const dayMovements = movements.filter((movement) => businessDateKey(movement.created_at) === key);
      return {
        key,
        inMonth: key.startsWith(`${monthKey}-`),
        movements: dayMovements,
        summary: summarizeMovements(dayMovements),
      };
    });
    const weekMovements = days.flatMap((day) => day.movements);
    weeks.push({
      key: weekStart,
      startKey: weekStart,
      endKey: addCalendarDays(weekStart, 6),
      days,
      summary: summarizeMovements(weekMovements),
    });
  }

  return weeks;
}

export function movementTypeLabel(type: CashMovementType) {
  if (type === "fund_addition") return "Fondo agregado";
  if (type === "withdrawal") return "Retiro";
  if (type === "expense") return "Gasto";
  return "Corrección";
}
