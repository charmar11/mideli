export type BusinessHourRule = {
  dayOfWeek: number;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
};

export type ScheduleException = {
  serviceDate: string;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

function localParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: weekdays[parts.weekday] ?? date.getUTCDay(),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function withinSchedule(current: number, opensAt: string, closesAt: string) {
  const opens = minutes(opensAt);
  const closes = minutes(closesAt);
  if (opens < closes) return current >= opens && current < closes;
  return current >= opens || current < closes;
}

export function isWhatsappBusinessOpen(input: {
  now?: Date;
  timeZone: string;
  hours: BusinessHourRule[];
  exceptions?: ScheduleException[];
}) {
  const local = localParts(input.now ?? new Date(), input.timeZone);
  const exception = input.exceptions?.find(
    (candidate) => candidate.serviceDate === local.date
  );
  if (exception) {
    return exception.isOpen && exception.opensAt && exception.closesAt
      ? withinSchedule(local.minutes, exception.opensAt, exception.closesAt)
      : false;
  }
  const rule = input.hours.find((candidate) => candidate.dayOfWeek === local.dayOfWeek);
  return Boolean(
    rule?.isOpen && withinSchedule(local.minutes, rule.opensAt, rule.closesAt)
  );
}
