import { expect, test } from "@playwright/test";
import { buildInventoryLineScope } from "@/lib/inventory-line-scope";

test("las líneas de inventario se delimitan por sus registros padre", () => {
  expect(
    buildInventoryLineScope(
      "business-1",
      [{ id: "count-1" }, { id: "count-2" }, { id: "count-1" }],
      [{ id: "purchase-1" }]
    )
  ).toEqual({
    scoped: true,
    countIds: ["count-1", "count-2"],
    purchaseOrderIds: ["purchase-1"],
  });
});

test("el modo legado no inventa un filtro de negocio para las líneas", () => {
  expect(buildInventoryLineScope(null, [{ id: "count-1" }], [])).toEqual({
    scoped: false,
    countIds: [],
    purchaseOrderIds: [],
  });
});
