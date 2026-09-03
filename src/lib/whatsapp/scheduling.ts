import type { WhatsappBusinessHours } from "@/types/database";
import type { ScheduleException } from "./business-hours";
import { normalizeText } from "./normalize";

const MINIMUM_SCHEDULE_LEAD_MINUTES = 20;

export type WhatsappScheduleResult =
  | { kind: "none" }
  | {
      kind: "scheduled";
      scheduledFor: string;
      kitchenReleaseAt: string;
      label: string;
    }
  | { kind: "invalid"; message: string };

type LocalDateParts = {
  date: string;
  year: number;
  month: number;
  day: number;
  minutes: number;
};

function localParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year,
    month,
    day,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function dayOfWeek(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function zonedDateToUtc(
  date: { year: number; month: number; day: number },
  minutes: number,
  timeZone: string
) {
  const guess = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Math.floor(minutes / 60),
    minutes % 60
  );
  const represented = localParts(new Date(guess), timeZone);
  const representedAsUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    Math.floor(represented.minutes / 60),
    represented.minutes % 60
  );
  return new Date(guess + (guess - representedAsUtc));
}

function scheduleForToday(input: {
  now: Date;
  timeZone: string;
  hours: WhatsappBusinessHours[];
  exceptions?: ScheduleException[];
}) {
  const current = localParts(input.now, input.timeZone);
  const exception = input.exceptions?.find(
    (candidate) => candidate.serviceDate === current.date
  );
  if (exception && !exception.isOpen) return null;
  const rule = exception?.isOpen
    ? {
        isOpen: true,
        opensAt: exception.opensAt ?? "12:00:00",
        closesAt: exception.closesAt ?? "23:00:00",
      }
    : (() => {
        const candidate = input.hours.find(
          (value) => value.day_of_week === dayOfWeek(current.year, current.month, current.day)
        );
        return candidate
          ? { isOpen: candidate.is_open, opensAt: candidate.opens_at, closesAt: candidate.closes_at }
          : null;
      })();
  if (!rule || !rule.isOpen) return null;
  return {
    current,
    opens: timeMinutes(rule.opensAt),
    closes: timeMinutes(rule.closesAt),
  };
}

function numberWord(value: string) {
  const words: Record<string, number> = {
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
  };
  return words[value] ?? null;
}

function extractRequestedTime(message: string) {
  const normalized = normalizeText(message);
  if (!/(?:a\s+la?s?|para\s+(?:hoy\s+)?la?s?|hoy\s+a|hora)/.test(normalized)) {
    return null;
  }
  if (/\bmanana\b|\bpasado manana\b/.test(normalized)) {
    return { invalidDate: true } as const;
  }
  const match = normalized.match(
    /(?:a\s+la?s?|para\s+(?:hoy\s+)?la?s?|hoy\s+a)\s+(\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s*[:.]\s*(\d{1,2}))?\s*(am|pm|a\s*m|p\s*m|de\s+la\s+manana|de\s+la\s+tarde|de\s+la\s+noche)?/
  );
  if (!match) return { invalidTime: true } as const;
  const rawHour = Number.isNaN(Number(match[1])) ? numberWord(match[1]) : Number(match[1]);
  const rawMinute = match[2] ? Number(match[2]) : 0;
  if (rawHour === null || rawHour < 1 || rawHour > 23 || rawMinute < 0 || rawMinute > 59) {
    return { invalidTime: true } as const;
  }
  const meridiem = match[3] ?? "";
  let hour = rawHour;
  if (rawHour <= 12 && (/pm|tarde|noche/.test(meridiem))) hour = rawHour === 12 ? 12 : rawHour + 12;
  if (rawHour === 12 && (/am|manana/.test(meridiem))) hour = 0;
  return { hour, minute: rawMinute } as const;
}

export function parseTodayScheduleRequest(input: {
  message: string;
  now?: Date;
  timeZone: string;
  hours: WhatsappBusinessHours[];
  exceptions?: ScheduleException[];
}): WhatsappScheduleResult {
  const requested = extractRequestedTime(input.message);
  if (!requested) return { kind: "none" };
  if ("invalidDate" in requested) {
    return { kind: "invalid", message: "Solo puedo programar pedidos para el día de hoy." };
  }
  if ("invalidTime" in requested) {
    return { kind: "invalid", message: "Dime una hora de hoy, por ejemplo: para las 8:00 p. m." };
  }

  const now = input.now ?? new Date();
  const schedule = scheduleForToday({ ...input, now });
  if (!schedule) {
    return { kind: "invalid", message: "Hoy no tenemos un horario disponible para programar pedidos." };
  }
  let minutes = requested.hour * 60 + requested.minute;
  if (requested.hour <= 12 && !/\b(?:am|pm|manana|tarde|noche)\b/.test(normalizeText(input.message))) {
    const currentHour = Math.floor(schedule.current.minutes / 60);
    minutes = requested.hour < 12 && currentHour >= requested.hour ? minutes + 12 * 60 : minutes;
  }
  const minimum = schedule.current.minutes + MINIMUM_SCHEDULE_LEAD_MINUTES;
  const closes = schedule.closes <= schedule.opens ? schedule.closes + 24 * 60 : schedule.closes;
  const comparableMinutes = minutes < schedule.opens && schedule.closes <= schedule.opens
    ? minutes + 24 * 60
    : minutes;
  if (comparableMinutes < schedule.opens || comparableMinutes >= closes) {
    return { kind: "invalid", message: "Elige una hora disponible dentro del horario de hoy." };
  }
  if (comparableMinutes < minimum) {
    return { kind: "invalid", message: "Esa hora está muy cerca. Elige una hora posterior para que podamos preparar tu pedido." };
  }

  const scheduledDate = zonedDateToUtc(schedule.current, minutes, input.timeZone);
  const releaseDate = new Date(scheduledDate.getTime() - MINIMUM_SCHEDULE_LEAD_MINUTES * 60_000);
  const label = new Intl.DateTimeFormat("es-MX", {
    timeZone: input.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledDate);
  return {
    kind: "scheduled",
    scheduledFor: scheduledDate.toISOString(),
    kitchenReleaseAt: releaseDate.toISOString(),
    label,
  };
}

export function applyScheduleToState<T extends { scheduledFor?: string | null; scheduledForLabel?: string | null; kitchenReleaseAt?: string | null }>(
  state: T,
  schedule: WhatsappScheduleResult
) {
  if (schedule.kind !== "scheduled") return state;
  return {
    ...state,
    scheduledFor: schedule.scheduledFor,
    scheduledForLabel: schedule.label,
    kitchenReleaseAt: schedule.kitchenReleaseAt,
  };
}
