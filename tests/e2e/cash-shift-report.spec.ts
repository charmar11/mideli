import { expect, test } from "@playwright/test";
import {
  buildCashShiftShareText,
  cashShiftDifferenceTone,
  cashShiftServiceCounts,
} from "@/lib/cash-shift-report";
import type { CashShiftDetail } from "@/types/cash";

function shiftFixture(): CashShiftDetail {
  return {
    id: "shift-1",
    number: 38,
    status: "closed",
    opening_float: 500,
    opening_denominations: {},
    opening_note: "",
    opened_by: "user-1",
    opened_by_name: "Andrea",
    opened_at: "2026-09-06T20:00:00.000Z",
    count_mode: "total",
    count_denominations: {},
    counted_cash: 850,
    expected_cash: 850,
    difference: 0,
    gross_sales: 650,
    net_sales: 650,
    discount_total: 0,
    tip_total: 0,
    collected_total: 650,
    cash_total: 350,
    card_total: 0,
    transfer_total: 300,
    voided_total: 0,
    fund_in_total: 0,
    withdrawal_total: 0,
    expense_total: 0,
    correction_total: 0,
    payment_count: 2,
    pending_order_count: 1,
    pending_balance: 135,
    close_note: "",
    closed_by: "user-1",
    closed_by_name: "Andrea",
    difference_authorized_by: null,
    difference_authorized_by_name: null,
    closed_at: "2026-09-07T04:00:00.000Z",
    archived_at: null,
    archived_by: null,
    archived_by_name: null,
    archive_reason: null,
    created_at: "2026-09-06T20:00:00.000Z",
    updated_at: "2026-09-07T04:00:00.000Z",
    movements: [],
    pending_orders: [],
    adjustments: [],
    opening_float_changes: [],
    payments: [
      {
        id: "payment-1",
        folio: 100,
        status: "completed",
        total_amount: 350,
        order_type: "domicilio",
        order_numbers: [179],
        item_count: 2,
        payment_methods: ["efectivo"],
        table_zone_name: null,
        table_number: null,
        customer_name: "Pier's",
        charged_by: "user-1",
        charged_by_name: "Andrea",
        created_at: "2026-09-06T22:00:00.000Z",
      },
      {
        id: "payment-2",
        folio: 101,
        status: "completed",
        total_amount: 300,
        order_type: "comedor",
        order_numbers: [180],
        item_count: 3,
        payment_methods: ["transferencia"],
        table_zone_name: "Terraza",
        table_number: "4",
        customer_name: null,
        charged_by: "user-1",
        charged_by_name: "Andrea",
        created_at: "2026-09-06T23:00:00.000Z",
      },
    ],
  };
}

test("agrupa las ventas del corte por tipo de servicio", () => {
  expect(cashShiftServiceCounts(shiftFixture().payments)).toEqual({
    comedor: 1,
    domicilio: 1,
    para_llevar: 0,
  });
});

test("el resumen compartible separa cobros y pendientes", () => {
  const summary = buildCashShiftShareText(shiftFixture());

  expect(summary).toContain("Corte Mideli #38");
  expect(summary).toContain("Venta neta: $650.00");
  expect(summary).toContain("Efectivo contado: $850.00");
  expect(summary).toContain("Pendientes transferidos: 1");
  expect(summary).not.toContain("envío");
});

test("clasifica diferencias con la tolerancia operativa", () => {
  expect(cashShiftDifferenceTone(20)).toBe("success");
  expect(cashShiftDifferenceTone(-20)).toBe("success");
  expect(cashShiftDifferenceTone(20.01)).toBe("danger");
});
