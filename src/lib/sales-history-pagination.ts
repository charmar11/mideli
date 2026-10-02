export const SALES_HISTORY_PAGE_SIZE = 100;

export interface SalesHistoryCursor {
  timestamp: string;
  id: string;
}

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidSalesHistoryCursor(
  cursor: SalesHistoryCursor | null | undefined
): boolean {
  if (cursor == null) return true;
  if (typeof cursor.timestamp !== "string" || typeof cursor.id !== "string") {
    return false;
  }

  return (
    ISO_TIMESTAMP_PATTERN.test(cursor.timestamp) &&
    !Number.isNaN(new Date(cursor.timestamp).getTime()) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cursor.id
    )
  );
}

export function normalizeSalesHistoryCursor(
  cursor: SalesHistoryCursor | null | undefined
): SalesHistoryCursor | null {
  if (!cursor) return null;
  return {
    // Keep database microseconds intact; Date.toISOString() truncates them.
    timestamp: cursor.timestamp,
    id: cursor.id.toLowerCase(),
  };
}

export function buildSalesHistoryCursorFilter(
  timestampColumn: "created_at" | "occurred_at",
  cursor: SalesHistoryCursor
): string {
  return `${timestampColumn}.lt.${cursor.timestamp},and(${timestampColumn}.eq.${cursor.timestamp},id.lt.${cursor.id})`;
}

export function sliceSalesHistoryPage<T extends { id: string }>(
  rows: readonly T[],
  pageSize: number,
  getTimestamp: (row: T) => string
): {
  rows: T[];
  hasMore: boolean;
  nextCursor: SalesHistoryCursor | null;
} {
  const pageRows = rows.slice(0, pageSize);
  const lastRow = pageRows.at(-1);
  const hasMore = rows.length > pageSize;

  return {
    rows: pageRows,
    hasMore,
    nextCursor:
      hasMore && lastRow
        ? { timestamp: getTimestamp(lastRow), id: lastRow.id }
        : null,
  };
}
