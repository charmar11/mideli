import type { AnalyticsPeriod } from "@/lib/analytics/period";

export interface OwnerReportSettings {
  enabled: boolean;
  recipientEmail: string;
  lastRun: {
    reportDate: string;
    status: "processing" | "sent" | "failed";
    sentAt: string | null;
    errorMessage: string;
  } | null;
}

export interface ProductProfitability {
  id: string;
  name: string;
  price: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginPercent: number | null;
  recipeStatus: "configured" | "missing";
}

export interface OwnerAction {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "success" | "brand";
  href?: string;
}

export interface OwnerOperationalData {
  period: AnalyticsPeriod;
  cash: {
    closedShifts: number;
    archivedShifts: number;
    expectedCash: number;
    countedCash: number;
    difference: number;
  };
  kitchen: {
    completedOrders: number;
    averageMinutes: number | null;
    delayedOrders: number;
  };
  inventory: {
    activeItems: number;
    lowStockItems: number;
    lowStockNames: string[];
    wasteQuantity: number;
    wasteCost: number;
  };
  menu: {
    activeProducts: number;
    productsWithoutSales: number;
    productsWithoutSalesNames: string[];
    configuredRecipes: number;
    missingRecipes: number;
    lowestMargins: ProductProfitability[];
    highestMargins: ProductProfitability[];
  };
  actions: OwnerAction[];
  report: OwnerReportSettings;
}

export interface OwnerDailySalesData {
  reportDate: string;
  revenue: number;
  paidOrders: number;
  averageTicket: number;
  tips: number;
  discounts: number;
  cancellations: number;
  voidedPayments: number;
  pendingOrders: number;
  pendingAmount: number;
  paymentMethods: Array<{
    method: "efectivo" | "tarjeta" | "transferencia";
    amount: number;
  }>;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}
