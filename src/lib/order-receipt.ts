import type { BusinessOrderPrintData } from "@/lib/actions/business-receipts";

type ReceiptOrder = Pick<
  BusinessOrderPrintData["order"],
  "productsSubtotal" | "discountAmount" | "paidAmount" | "type" | "deliveryFee"
>;

export function getOrderReceiptTotals(order: ReceiptOrder) {
  const productsAfterDiscount = Math.max(0, order.productsSubtotal - order.discountAmount);
  const paidAmount = Math.min(productsAfterDiscount, Math.max(0, order.paidAmount));

  return {
    productsAfterDiscount,
    paidAmount,
    productsBalance: Math.max(0, productsAfterDiscount - paidAmount),
    customerTotal: productsAfterDiscount + (order.type === "domicilio" ? order.deliveryFee : 0),
  };
}
