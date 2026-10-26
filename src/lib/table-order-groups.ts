export interface TableOrderReference {
  id?: string;
  type: string;
  table_visit_id?: string | null;
  table_id?: string | null;
  table_number?: string | null;
  table_zone_id?: string | null;
  table_zone_name?: string | null;
  business_id?: string | null;
  business_account_id?: string | null;
}

export type DiningOrderGroup<T extends TableOrderReference> =
  | { kind: "order"; key: string; order: T }
  | { kind: "table"; key: string; orders: T[] };

function normalizedLabel(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("es-MX") ?? "";
}

export function getDiningTableGroupKey(order: TableOrderReference) {
  if (order.type !== "comedor") return null;

  const visitId = order.table_visit_id?.trim();
  if (visitId) return `visit:${visitId}`;

  const tableId = order.table_id?.trim();
  if (tableId) return `table:${tableId}`;

  const tableNumber = normalizedLabel(order.table_number);
  if (!tableNumber) return null;

  const zone = normalizedLabel(order.table_zone_id ?? order.table_zone_name);
  return `legacy:${zone}:${tableNumber}`;
}

export function areOrdersFromSameDiningTable(
  left: TableOrderReference,
  right: TableOrderReference
) {
  const leftKey = getDiningTableGroupKey(left);
  return leftKey !== null && leftKey === getDiningTableGroupKey(right);
}

export function getBusinessTableAccountKey(order: TableOrderReference) {
  const accountId = order.business_account_id?.trim();
  if (accountId) return `account:${accountId}`;
  return `business:${order.business_id?.trim() ?? "legacy"}`;
}

export function areOrdersFromSameBusinessTableAccount(
  left: TableOrderReference,
  right: TableOrderReference
) {
  return (
    areOrdersFromSameDiningTable(left, right) &&
    getBusinessTableAccountKey(left) === getBusinessTableAccountKey(right)
  );
}

export function getOpenOrdersForBusinessTableAccount<
  T extends TableOrderReference & { status?: string }
>(
  order: T,
  candidates: readonly T[],
  hasBalance: (candidate: T) => boolean
) {
  return candidates.filter(
    (candidate) =>
      areOrdersFromSameBusinessTableAccount(order, candidate) &&
      candidate.status !== "cancelled" &&
      candidate.status !== "paid" &&
      hasBalance(candidate)
  );
}

export function groupDiningOrdersByTable<T extends TableOrderReference>(
  orders: readonly T[]
): DiningOrderGroup<T>[] {
  const groups: DiningOrderGroup<T>[] = [];
  const tableGroupIndexes = new Map<string, number>();

  orders.forEach((order, index) => {
    const tableKey = getDiningTableGroupKey(order);
    if (!tableKey) {
      groups.push({
        kind: "order",
        key: `order:${order.id ?? index}`,
        order,
      });
      return;
    }

    const existingIndex = tableGroupIndexes.get(tableKey);
    if (existingIndex !== undefined) {
      const group = groups[existingIndex];
      if (group?.kind === "table") group.orders.push(order);
      return;
    }

    tableGroupIndexes.set(tableKey, groups.length);
    groups.push({
      kind: "table",
      key: tableKey,
      orders: [order],
    });
  });

  return groups;
}
