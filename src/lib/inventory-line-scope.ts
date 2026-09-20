type ParentRow = {
  id: string;
};

export type InventoryLineScope = {
  scoped: boolean;
  countIds: string[];
  purchaseOrderIds: string[];
};

function uniqueIds(rows: readonly ParentRow[] | null | undefined) {
  return [...new Set((rows ?? []).map((row) => row.id))];
}

export function buildInventoryLineScope(
  businessId: string | null,
  counts: readonly ParentRow[] | null | undefined,
  purchaseOrders: readonly ParentRow[] | null | undefined
): InventoryLineScope {
  if (!businessId) {
    return {
      scoped: false,
      countIds: [],
      purchaseOrderIds: [],
    };
  }

  return {
    scoped: true,
    countIds: uniqueIds(counts),
    purchaseOrderIds: uniqueIds(purchaseOrders),
  };
}
