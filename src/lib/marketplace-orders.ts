import type { Order } from "@/types/database";

export type MarketplacePlatform = "uber_eats" | "didi_food";
export type MarketplacePaymentMode = "app" | "cash";
export type MarketplaceOrderSelection = {
  platform: MarketplacePlatform;
  paymentMode: MarketplacePaymentMode;
};
export type MarketplaceServiceOrderType = "domicilio" | "para_llevar";
export type MarketplaceProductAvailability = Record<
  string,
  Partial<Record<MarketplacePlatform, boolean>>
>;

export function getMarketplaceConfigBusinessId(
  activeBusinessId: string | null,
  cartBusinessIds: readonly string[],
): string | null {
  if (
    !activeBusinessId ||
    cartBusinessIds.length !== 1 ||
    cartBusinessIds[0] !== activeBusinessId
  ) {
    return null;
  }

  return activeBusinessId;
}

export function isMarketplacePosConfigReady(
  configKey: string,
  expectedKey: string,
  loading: boolean,
): boolean {
  return Boolean(expectedKey) && configKey === expectedKey && !loading;
}

export type PickupChannelOptionState = "hidden" | "selected" | "available";

export function getPickupChannelOptionState(
  orderType: MarketplaceServiceOrderType | "comedor",
  marketplace: MarketplaceOrderSelection | null,
): PickupChannelOptionState {
  if (orderType !== "para_llevar") return "hidden";
  return marketplace === null ? "selected" : "available";
}

export function getUnavailableMarketplaceProductNames(
  platform: MarketplacePlatform,
  products: readonly { menu_item_id: string; name: string }[],
  availability: MarketplaceProductAvailability,
): string[] {
  return products
    .filter((product) => availability[product.menu_item_id]?.[platform] !== true)
    .map((product) => product.name);
}

export function isMarketplaceOrderSelection(value: unknown): value is MarketplaceOrderSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Record<string, unknown>;
  return (
    (selection.platform === "uber_eats" || selection.platform === "didi_food") &&
    (selection.paymentMode === "app" ||
      (selection.platform === "didi_food" && selection.paymentMode === "cash"))
  );
}

export type MarketplaceOrderFields = Pick<
  Order,
  "type" | "marketplace_platform" | "marketplace_payment_mode" | "marketplace_handed_off_at"
>;

export function isMarketplaceOrder(order: Pick<Order, "marketplace_platform">): boolean {
  return order.marketplace_platform === "uber_eats" || order.marketplace_platform === "didi_food";
}

export function hasRecordedMarketplaceCashReceipt(
  order: Pick<
    Order,
    | "marketplace_platform"
    | "marketplace_payment_mode"
    | "marketplace_handed_off_at"
    | "marketplace_cash_received"
    | "marketplace_cash_shift_id"
  >,
): boolean {
  return (
    order.marketplace_platform === "didi_food" &&
    order.marketplace_payment_mode === "cash" &&
    Boolean(order.marketplace_handed_off_at) &&
    order.marketplace_cash_received !== null &&
    order.marketplace_cash_received !== undefined &&
    Boolean(order.marketplace_cash_shift_id)
  );
}

export function isLocalDeliveryOrder(order: Pick<Order, "type" | "marketplace_platform">): boolean {
  return order.type === "domicilio" && !isMarketplaceOrder(order);
}

export function countsTowardLocalPendingBalance(
  order: Pick<Order, "marketplace_platform">,
): boolean {
  return !isMarketplaceOrder(order);
}

export function marketplacePlatformLabel(platform: MarketplacePlatform | null | undefined): string | null {
  if (platform === "uber_eats") return "Uber Eats";
  if (platform === "didi_food") return "Didi Food";
  return null;
}

export function marketplacePaymentLabel(
  platform: MarketplacePlatform | null | undefined,
  mode: MarketplacePaymentMode | null | undefined,
): string | null {
  if (!platform || !mode) return null;
  if (mode === "app") return "Pagado en la app";
  if (platform === "didi_food" && mode === "cash") return "Efectivo al repartidor";
  return null;
}

export function shouldCollectMarketplaceCash(
  order: Pick<MarketplaceOrderFields, "marketplace_platform" | "marketplace_payment_mode" | "marketplace_handed_off_at">,
) {
  return order.marketplace_platform === "didi_food" &&
    order.marketplace_payment_mode === "cash" &&
    !order.marketplace_handed_off_at;
}

export function parseMarketplaceCashAmount(value: string): { amount: number | null; error: string | null } {
  const normalized = value.trim();
  if (!normalized) return { amount: null, error: "Escribe el efectivo que recibiste del repartidor." };
  if (!/^\d{1,7}$/.test(normalized)) {
    return { amount: null, error: "Usa un monto en pesos, sin centavos ni signos." };
  }
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000) {
    return { amount: null, error: "El monto debe estar entre $0 y $1,000,000." };
  }
  return { amount, error: null };
}

export function marketplaceCashDifference(orderTotal: number, cashReceived: number): number {
  return cashReceived - orderTotal;
}
