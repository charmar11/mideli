import { BUSINESS_TIME_ZONE } from "@/lib/date-period";

export interface TodayOrderSchedule {
  scheduledFor: string;
  kitchenReleaseAt: string;
  label: string;
}

export type TodayOrderScheduleResult =
  | { success: true; schedule: TodayOrderSchedule }
  | { success: false; error: string };

type LocalDateParts = { year: number; month: number; day: number };

function localDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function zonedTimeToUtc(date: LocalDateParts, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(guess))
      .map(({ type, value }) => [type, value]),
  );
  const represented = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return new Date(guess + (guess - represented));
}

export function createTodayOrderSchedule(
  timeValue: string,
  options: { now?: Date; timeZone?: string } = {},
): TodayOrderScheduleResult {
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!match) return { success: false, error: "Selecciona una hora válida." };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return { success: false, error: "Selecciona una hora válida." };
  }

  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? BUSINESS_TIME_ZONE;
  const scheduledFor = zonedTimeToUtc(localDateParts(now, timeZone), hour, minute, timeZone);
  if (scheduledFor.getTime() <= now.getTime()) {
    return { success: false, error: "La hora debe ser posterior a la hora actual de hoy." };
  }

  return {
    success: true,
    schedule: {
      scheduledFor: scheduledFor.toISOString(),
      // Keep scheduled pickup orders visible to the team immediately; this is
      // a requested handoff time, not an instruction to hide the order.
      kitchenReleaseAt: now.toISOString(),
      label: new Intl.DateTimeFormat("es-MX", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      }).format(scheduledFor),
    },
  };
}

export function toOrderTimeInputValue(value: string | null | undefined, timeZone = BUSINESS_TIME_ZONE) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.hour}:${parts.minute}`;
}
