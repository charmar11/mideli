export type AnalyticsPeriodView = "dia" | "semana" | "mes" | "anio";

export interface AnalyticsPeriod {
  view: AnalyticsPeriodView;
  from: string;
  to: string;
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayKey(): string {
  return toDateKey(new Date());
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  return result;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

function clampToToday(date: Date, today: Date): Date {
  return date > today ? today : date;
}

export function periodFromAnchor(
  view: AnalyticsPeriodView,
  anchor: Date,
  today = parseDateKey(getTodayKey())
): AnalyticsPeriod {
  let from = new Date(anchor);
  let to = new Date(anchor);

  if (view === "semana") {
    from = startOfWeek(anchor);
    to = addDays(from, 6);
  } else if (view === "mes") {
    from = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    to = endOfMonth(anchor);
  } else if (view === "anio") {
    from = new Date(anchor.getFullYear(), 0, 1, 12);
    to = new Date(anchor.getFullYear(), 11, 31, 12);
  }

  return {
    view,
    from: toDateKey(from),
    to: toDateKey(clampToToday(to, today)),
  };
}

export function shiftPeriod(
  period: AnalyticsPeriod,
  direction: -1 | 1,
  today = parseDateKey(getTodayKey())
): AnalyticsPeriod {
  const anchor = parseDateKey(period.from);

  if (period.view === "dia") anchor.setDate(anchor.getDate() + direction);
  if (period.view === "semana") anchor.setDate(anchor.getDate() + direction * 7);
  if (period.view === "mes") anchor.setMonth(anchor.getMonth() + direction);
  if (period.view === "anio") anchor.setFullYear(anchor.getFullYear() + direction);

  return periodFromAnchor(period.view, anchor, today);
}

export function getPreviousPeriod(period: AnalyticsPeriod): AnalyticsPeriod {
  const from = parseDateKey(period.from);
  const to = parseDateKey(period.to);
  const durationDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(durationDays - 1));

  return {
    view: period.view,
    from: toDateKey(previousFrom),
    to: toDateKey(previousTo),
  };
}

export function normalizePeriod(
  viewValue?: string,
  fromValue?: string,
  toValue?: string
): AnalyticsPeriod {
  const view: AnalyticsPeriodView = ["dia", "semana", "mes", "anio"].includes(
    viewValue ?? ""
  )
    ? (viewValue as AnalyticsPeriodView)
    : "semana";
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

export function periodLabel(period: AnalyticsPeriod): string {
  const from = parseDateKey(period.from);
  const to = parseDateKey(period.to);
  const shortDate = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  });

  if (period.view === "dia") {
    return shortDate.format(from).replace(".", "");
  }
  if (period.view === "semana") {
    return `${shortDate.format(from).replace(".", "")} a ${shortDate
      .format(to)
      .replace(".", "")}`;
  }
  if (period.view === "mes") {
    return new Intl.DateTimeFormat("es-MX", {
      month: "long",
      year: "numeric",
    }).format(from);
  }
  return String(from.getFullYear());
}

export function queryTimestamp(dateKey: string, edge: "start" | "end"): string {
  return edge === "start"
    ? `${dateKey}T00:00:00-07:00`
    : `${dateKey}T23:59:59.999-07:00`;
}
