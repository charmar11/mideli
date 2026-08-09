export type CashShiftStatus = "open" | "closed";
export type CashCountMode = "denominations" | "total";
export type CashMovementType =
  | "fund_addition"
  | "withdrawal"
  | "expense"
  | "correction";
export type CashDirection = "in" | "out";
export type CashAuthorizationAction =
  | "cash_movement"
  | "close_difference"
  | "shift_adjustment";

export interface CashShiftTotals {
  payment_count: number;
  gross_sales?: number;
  discount_total: number;
  tip_total: number;
  net_sales?: number;
  collected_total?: number;
  voided_total: number;
  cash_total?: number;
  card_total: number;
  transfer_total: number;
  fund_in_total: number;
  withdrawal_total: number;
  expense_total: number;
  correction_total: number;
  pending_order_count: number;
  pending_balance: number;
  expected_cash?: number;
}

export interface CashShift {
  id: string;
  number: number;
  status: CashShiftStatus;
  opening_float: number;
  opening_denominations: Record<string, number>;
  opening_note: string;
  opened_by: string;
  opened_by_name: string;
  opened_at: string;
  count_mode: CashCountMode | null;
  count_denominations: Record<string, number>;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  gross_sales: number;
  net_sales: number;
  discount_total: number;
  tip_total: number;
  collected_total: number;
  cash_total: number;
  card_total: number;
  transfer_total: number;
  voided_total: number;
  fund_in_total: number;
  withdrawal_total: number;
  expense_total: number;
  correction_total: number;
  payment_count: number;
  pending_order_count: number;
  pending_balance: number;
  close_note: string;
  closed_by: string | null;
  closed_by_name: string | null;
  difference_authorized_by: string | null;
  difference_authorized_by_name: string | null;
  closed_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archived_by_name: string | null;
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
  operating_totals?: CashShiftTotals;
}

export interface CashMovement {
  id: string;
  shift_id: string;
  movement_type: CashMovementType;
  direction: CashDirection;
  amount: number;
  reason: string;
  created_by: string;
  created_by_name: string;
  authorized_by: string;
  authorized_by_name: string;
  created_at: string;
}

export interface CashPendingOrder {
  id: string;
  closing_shift_id: string;
  next_shift_id: string | null;
  order_id: string | null;
  order_number: number;
  order_type: "comedor" | "domicilio" | "para_llevar";
  table_zone_name: string | null;
  table_number: string | null;
  customer_name: string | null;
  outstanding_amount: number;
  items_snapshot: Array<{
    quantity: number;
    name: string;
    notes: string;
    selected_modifiers: unknown[];
  }>;
  created_at: string;
}

export interface CashShiftAdjustment {
  id: string;
  shift_id: string;
  payment_method: "efectivo" | "tarjeta" | "transferencia" | "otro";
  direction: "increase" | "decrease";
  amount: number;
  reason: string;
  created_by: string;
  created_by_name: string;
  authorized_by: string;
  authorized_by_name: string;
  created_at: string;
}

export interface CashShiftPaymentSummary {
  id: string;
  folio: number;
  status: "completed" | "voided";
  total_amount: number;
  table_zone_name: string | null;
  table_number: string | null;
  customer_name: string | null;
  charged_by: string;
  charged_by_name: string;
  created_at: string;
}

export interface CashShiftDetail extends CashShift {
  movements: CashMovement[];
  pending_orders: CashPendingOrder[];
  adjustments: CashShiftAdjustment[];
  payments: CashShiftPaymentSummary[];
}

export interface CashShiftDeletionImpact {
  id: string;
  number: number;
  status: CashShiftStatus;
  archived_at: string | null;
  orders: number;
  payments: number;
  movements: number;
  adjustments: number;
  transfers: number;
  deletable: boolean;
}

export interface CashClosePreview extends CashShiftTotals {
  counted_cash: number;
  expected_cash: number;
  difference: number;
  requires_authorization: boolean;
}

export interface CashAuthorizer {
  id: string;
  full_name: string;
  role: "owner" | "admin" | "supervisor";
  pin_configured: boolean;
}
