import { expect, test } from "@playwright/test";
import {
  buildSalesHistoryCursorFilter,
  isValidSalesHistoryCursor,
  normalizeSalesHistoryCursor,
  SALES_HISTORY_PAGE_SIZE,
  sliceSalesHistoryPage,
} from "../../src/lib/sales-history-pagination";

const timestamp = "2026-10-01T18:30:00.000Z";
const firstId = "f0000000-0000-4000-8000-000000000000";
const secondId = "e0000000-0000-4000-8000-000000000000";
const thirdId = "d0000000-0000-4000-8000-000000000000";

test("limita cada consulta a 100 filas y avisa si hay otra página", () => {
  const rows = Array.from({ length: SALES_HISTORY_PAGE_SIZE + 1 }, (_, index) => ({
    id: String(index),
    created_at: timestamp,
  }));
  const result = sliceSalesHistoryPage(
    rows,
    SALES_HISTORY_PAGE_SIZE,
    (row) => row.created_at
  );

  expect(result.rows).toHaveLength(100);
  expect(result.hasMore).toBe(true);
  expect(result.nextCursor?.id).toBe("99");
});

test("la página conserva un cursor estable aunque varios registros compartan hora", () => {
  const result = sliceSalesHistoryPage(
    [
      { id: firstId, created_at: timestamp },
      { id: secondId, created_at: timestamp },
      { id: thirdId, created_at: timestamp },
    ],
    2,
    (row) => row.created_at
  );

  expect(result.rows.map((row) => row.id)).toEqual([firstId, secondId]);
  expect(result.hasMore).toBe(true);
  expect(result.nextCursor).toEqual({ timestamp, id: secondId });
  expect(
    buildSalesHistoryCursorFilter("created_at", result.nextCursor!)
  ).toBe(
    `created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${secondId})`
  );
});

test("la última página no ofrece otro cursor", () => {
  const result = sliceSalesHistoryPage(
    [{ id: firstId, occurred_at: timestamp }],
    2,
    (row) => row.occurred_at
  );

  expect(result.rows).toHaveLength(1);
  expect(result.hasMore).toBe(false);
  expect(result.nextCursor).toBeNull();
});

test("normaliza cursores y rechaza valores que no pueden usarse en una consulta", () => {
  const preciseTimestamp = "2026-10-01T18:30:00.123456+00:00";
  const cursor = {
    timestamp: preciseTimestamp,
    id: firstId.toUpperCase(),
  };

  expect(isValidSalesHistoryCursor(cursor)).toBe(true);
  expect(normalizeSalesHistoryCursor(cursor)).toEqual({
    timestamp: preciseTimestamp,
    id: firstId,
  });
  expect(
    isValidSalesHistoryCursor({ timestamp, id: `${firstId},id.neq.null` })
  ).toBe(false);
  expect(isValidSalesHistoryCursor({ timestamp: "no-es-fecha", id: firstId })).toBe(
    false
  );
  expect(
    isValidSalesHistoryCursor({
      timestamp: `${preciseTimestamp},id.neq.null`,
      id: firstId,
    })
  ).toBe(false);
});
