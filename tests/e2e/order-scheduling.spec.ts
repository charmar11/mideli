import { expect, test } from "@playwright/test";
import {
  createTodayOrderSchedule,
  toOrderTimeInputValue,
} from "@/lib/order-scheduling";

test("programa una hora posterior del mismo día operativo y deja visible el pedido desde ahora", () => {
  const result = createTodayOrderSchedule("17:15", {
    now: new Date("2026-10-03T23:00:00.000Z"),
    timeZone: "America/Hermosillo",
  });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.schedule.scheduledFor).toBe("2026-10-04T00:15:00.000Z");
  expect(result.schedule.kitchenReleaseAt).toBe("2026-10-03T23:00:00.000Z");
  expect(toOrderTimeInputValue(result.schedule.scheduledFor, "America/Hermosillo")).toBe("17:15");
});

test("no acepta horas pasadas ni formatos incompletos", () => {
  const now = new Date("2026-10-03T23:00:00.000Z");

  expect(createTodayOrderSchedule("15:00", { now }).success).toBe(false);
  expect(createTodayOrderSchedule("8:00", { now }).success).toBe(false);
});
