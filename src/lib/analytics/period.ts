import {
  addDays,
  normalizeDatePeriod,
  parseDateKey,
  toDateKey,
  type DatePeriod,
} from "@/lib/date-period";

export {
  BUSINESS_TIME_ZONE,
  addDays,
  getTodayKey,
  normalizeDatePeriod,
  parseDateKey,
  periodFromAnchor,
  periodLabel,
  periodTimestamps,
  queryTimestamp,
  shiftPeriod,
  startOfWeek,
  toDateKey,
} from "@/lib/date-period";

export type {
  DatePeriodView as AnalyticsPeriodView,
  DatePeriod as AnalyticsPeriod,
} from "@/lib/date-period";

export function getPreviousPeriod(period: DatePeriod): DatePeriod {
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
) {
  return normalizeDatePeriod(viewValue, fromValue, toValue);
}
