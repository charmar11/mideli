import type { Order, SelectedModifier } from "@/types/database";

export type PaymentMethod = NonNullable<Order["payment_method"]>;

export interface PaymentTenderInput {
  method: PaymentMethod;
  amount: number;
  cash_received?: number;
}

export interface PaymentOrderAllocationInput {
  order_id: string;
  gross_amount: number;
  discount_amount: number;
}

export interface PaymentItemAllocationInput {
  order_item_id: string;
  quantity: number;
  line_total: number;
}

export interface PaymentReceiptTransaction {
  id: string;
  folio: number;
  status: "completed" | "voided";
  subtotal_amount: number;
  discount_amount: number;
  tip_amount: number;
  total_amount: number;
  cash_received: number;
  change_given: number;
  table_id: string | null;
  table_number: string | null;
  customer_name: string | null;
  order_type: Order["type"];
  charged_by: string;
  charged_by_name: string | null;
  discount_authorized_by: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface PaymentReceiptOrder {
  order_id: string;
  number: number;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
}

export interface PaymentReceiptItem {
  order_id: string;
  order_item_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  selected_modifiers: SelectedModifier[];
  line_total: number;
}

export interface PaymentReceiptTender {
  method: PaymentMethod;
  amount: number;
  cash_received: number | null;
  change_given: number | null;
}

export interface PaymentReceipt {
  transaction: PaymentReceiptTransaction;
  orders: PaymentReceiptOrder[];
  items: PaymentReceiptItem[];
  tenders: PaymentReceiptTender[];
}

export interface PaymentAuthorizer {
  id: string;
  full_name: string;
  role: "owner" | "admin";
}
