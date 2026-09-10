export type DatePeriodView = "dia" | "semana" | "mes" | "anio";

export const BUSINESS_TIME_ZONE = "America/Hermosillo";

export interface DatePeriod {
  view: DatePeriodView;
  from: string;
  to: string;
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  calendar: "gregory",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function getTodayKey(now = new Date()): string {
  const parts = Object.fromEntries(
    businessDateFormatter
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  );
  return String(parts.year) + "-" + String(parts.month) + "-" + String(parts.day);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const mondayOffset = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - mondayOffset);
  return result;
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
}

function clampToToday(date: Date, today: Date): Date {
  return date > today ? today : date;
}

export function periodFromAnchor(
  view: DatePeriodView,
  anchor: Date,
  today = parseDateKey(getTodayKey())
): DatePeriod {
  let from = new Date(anchor);
  let to = new Date(anchor);

  if (view === "semana") {
    from = startOfWeek(anchor);
    to = addDays(from, 6);
  } else if (view === "mes") {
    from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12));
    to = endOfMonth(anchor);
  } else if (view === "anio") {
    from = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1, 12));
    to = new Date(Date.UTC(anchor.getUTCFullYear(), 11, 31, 12));
  }

  return {
    view,
    from: toDateKey(from),
    to: toDateKey(clampToToday(to, today)),
  };
}

export function shiftPeriod(
  period: DatePeriod,
  direction: -1 | 1,
  today = parseDateKey(getTodayKey())
): DatePeriod {
  const anchor = parseDateKey(period.from);

  if (period.view === "dia") anchor.setUTCDate(anchor.getUTCDate() + direction);
  if (period.view === "semana") anchor.setUTCDate(anchor.getUTCDate() + direction * 7);
  if (period.view === "mes") anchor.setUTCMonth(anchor.getUTCMonth() + direction);
  if (period.view === "anio") anchor.setUTCFullYear(anchor.getUTCFullYear() + direction);

  return periodFromAnchor(period.view, anchor, today);
}

export function periodLabel(period: DatePeriod): string {
  const from = parseDateKey(period.from);
  const to = parseDateKey(period.to);
  const shortDate = new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });

  if (period.view === "dia") return shortDate.format(from).replace(".", "");
  if (period.view === "semana") {
    return shortDate.format(from).replace(".", "") + " a " + shortDate.format(to).replace(".", "");
  }
  if (period.view === "mes") {
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }).format(from);
  }
  return String(from.getUTCFullYear());
}

export function normalizeDatePeriod(
  viewValue?: string,
  fromValue?: string,
  toValue?: string
): DatePeriod {
  const view: DatePeriodView = ["dia", "semana", "mes", "anio"].includes(viewValue ?? "")
    ? (viewValue as DatePeriodView)
    : "dia";
  const todayKey = getTodayKey();

  if (
    fromValue &&
    toValue &&
    VALID_DATE.test(fromValue) &&
    VALID_DATE.test(toValue) &&
    fromValue <= toValue &&
    fromValue <= todayKey
  ) {
    return {
      view,
      from: fromValue,
      to: toValue > todayKey ? todayKey : toValue,
    };
  }

  return periodFromAnchor(view, parseDateKey(todayKey));
}

export function queryTimestamp(dateKey: string, edge: "start" | "end"): string {
  return edge === "start"
    ? dateKey + "T00:00:00-07:00"
    : dateKey + "T23:59:59.999-07:00";
}

export function periodTimestamps(period: DatePeriod) {
  return {
    desde: queryTimestamp(period.from, "start"),
    hasta: queryTimestamp(period.to, "end"),
  };
}
