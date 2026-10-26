import type {
  MarketplacePaymentMode,
  MarketplacePlatform,
} from "@/lib/marketplace-orders";

export interface MarketplaceAnalyticsOrder {
  marketplace_platform: MarketplacePlatform;
  marketplace_payment_mode: MarketplacePaymentMode;
  marketplace_handed_off_at: string | null;
  marketplace_cash_received: number | null;
  status: string;
  total: number;
}

export interface MarketplacePlatformBreakdown {
  platform: MarketplacePlatform;
  orders: number;
  handedOffOrders: number;
  pendingHandoffOrders: number;
  cancelledOrders: number;
  handedOffValue: number;
  appValue: number;
  cashReceived: number;
}

export interface MarketplaceAnalyticsTotals {
  orders: number;
  handedOffOrders: number;
  pendingHandoffOrders: number;
  cancelledOrders: number;
  handedOffValue: number;
  appValue: number;
  cashReceived: number;
}

export function summarizeMarketplaceOrders(orders: MarketplaceAnalyticsOrder[]): {
  totals: MarketplaceAnalyticsTotals;
  platforms: MarketplacePlatformBreakdown[];
} {
  const byPlatform = new Map<MarketplacePlatform, MarketplacePlatformBreakdown>();
  const totals: MarketplaceAnalyticsTotals = {
    orders: 0,
    handedOffOrders: 0,
    pendingHandoffOrders: 0,
    cancelledOrders: 0,
    handedOffValue: 0,
    appValue: 0,
    cashReceived: 0,
  };

  for (const order of orders) {
    const platform = byPlatform.get(order.marketplace_platform) ?? {
      platform: order.marketplace_platform,
      orders: 0,
      handedOffOrders: 0,
      pendingHandoffOrders: 0,
      cancelledOrders: 0,
      handedOffValue: 0,
      appValue: 0,
      cashReceived: 0,
    };

    if (order.status === "cancelled") {
      platform.cancelledOrders += 1;
      totals.cancelledOrders += 1;
      byPlatform.set(order.marketplace_platform, platform);
      continue;
    }

    platform.orders += 1;
    totals.orders += 1;

    if (!order.marketplace_handed_off_at) {
      platform.pendingHandoffOrders += 1;
      totals.pendingHandoffOrders += 1;
      byPlatform.set(order.marketplace_platform, platform);
      continue;
    }

    const orderValue = Number(order.total) || 0;
    platform.handedOffOrders += 1;
    platform.handedOffValue += orderValue;
    totals.handedOffOrders += 1;
    totals.handedOffValue += orderValue;

    if (order.marketplace_payment_mode === "app") {
      platform.appValue += orderValue;
      totals.appValue += orderValue;
    }

    if (
      order.marketplace_platform === "didi_food" &&
      order.marketplace_payment_mode === "cash"
    ) {
      const received = Number(order.marketplace_cash_received) || 0;
      platform.cashReceived += received;
      totals.cashReceived += received;
    }

    byPlatform.set(order.marketplace_platform, platform);
  }

  return {
    totals,
    platforms: Array.from(byPlatform.values()).sort((a, b) =>
      a.platform.localeCompare(b.platform)
    ),
  };
}
