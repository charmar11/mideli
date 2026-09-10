import { expect, test } from "@playwright/test";
import { monthRange, monthWeeks } from "@/lib/cash-movement-periods";
import type { CashMovementRecord } from "@/types/cash";

function movement(overrides: Partial<CashMovementRecord>): CashMovementRecord {
  return {
    id: crypto.randomUUID(),
    shift_id: "shift-1",
    movement_type: "expense",
    direction: "out",
    amount: 100,
    reason: "Compra de prueba",
    created_by: "user-1",
    created_by_name: "Ana",
    authorized_by: "user-2",
    authorized_by_name: "Admin",
    created_at: "2026-09-02T20:00:00.000Z",
    shift_number: 12,
    shift_status: "closed",
    shift_archived_at: null,
    corrected_amount: null,
    correction_reason: null,
    corrected_by: null,
    corrected_by_name: null,
    correction_authorized_by: null,
    correction_authorized_by_name: null,
    corrected_at: null,
    correction_status: "active",
    ...overrides,
  };
}

test("agrupa los movimientos por semanas y días del mes", () => {
  const weeks = monthWeeks("2026-09", [
    movement({ id: "one", created_at: "2026-09-02T20:00:00.000Z", amount: 50 }),
    movement({ id: "two", created_at: "2026-09-02T22:00:00.000Z", amount: 25 }),
    movement({ id: "three", created_at: "2026-09-15T20:00:00.000Z", amount: 80, movement_type: "withdrawal" }),
  ]);

  expect(weeks).toHaveLength(5);
  expect(weeks[0].startKey).toBe("2026-08-31");
  expect(weeks[0].days.find((day) => day.key === "2026-09-02")?.summary.count).toBe(2);
  expect(weeks[0].summary.expenses).toBe(75);
  expect(weeks[2].days.find((day) => day.key === "2026-09-15")?.summary.withdrawals).toBe(80);
});

test("calcula el rango mensual en la zona horaria de Hermosillo", () => {
  expect(monthRange("2026-09")).toEqual({
    since: "2026-09-01T07:00:00.000Z",
    until: "2026-10-01T07:00:00.000Z",
  });
});
