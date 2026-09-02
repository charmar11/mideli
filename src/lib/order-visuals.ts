export type OrderType = "comedor" | "domicilio" | "para_llevar";

export const ORDER_TYPE_VISUALS: Record<
  OrderType,
  {
    selected: string;
    icon: string;
    badge: string;
  }
> = {
  comedor: {
    selected: "border-gold/60 bg-gold-light text-gold shadow-sm ring-1 ring-gold/25",
    icon: "bg-gold-light text-gold",
    badge: "bg-gold-light text-gold",
  },
  domicilio: {
    selected: "border-success/60 bg-success-light text-success shadow-sm ring-1 ring-success/25",
    icon: "bg-success-light text-success",
    badge: "bg-success-light text-success",
  },
  para_llevar: {
    selected: "border-brand/60 bg-brand-light text-brand shadow-sm ring-1 ring-brand/25",
    icon: "bg-brand-light text-brand",
    badge: "bg-brand-light text-brand",
  },
};

export const ORDER_STATUS_VISUALS: Record<string, string> = {
  pending: "bg-warning-light text-warning ring-1 ring-warning/20",
  in_kitchen: "bg-gold-light text-gold ring-1 ring-gold/20",
  ready: "bg-success-light text-success ring-1 ring-success/20",
  served: "bg-brand-light text-brand ring-1 ring-brand/20",
  paid: "bg-success-light text-success ring-1 ring-success/20",
  cancelled: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

export const DELIVERY_STATUS_VISUALS: Record<string, string> = {
  pending: "bg-warning-light text-warning ring-1 ring-warning/20",
  searching_driver: "bg-gold-light text-gold ring-1 ring-gold/20",
  driver_on_way: "bg-success-light text-success ring-1 ring-success/20",
  customer_received: "bg-success-light text-success ring-1 ring-success/20",
};
