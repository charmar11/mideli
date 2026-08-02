import type { Order } from "@/types/database";

type LocationInput = Pick<
  Order,
  "type" | "table_number" | "table_zone_name" | "customer_name"
>;

export function formatTableName(value: string | null | undefined) {
  const name = value?.trim();
  if (!name) return "";

  const numeric = name.match(/^#?\s*(\d+)$/);
  if (numeric) return `Mesa #${numeric[1]}`;

  const prefixed = name.match(/^mesa\s*#?\s*(\d+)$/i);
  if (prefixed) return `Mesa #${prefixed[1]}`;

  return name;
}

export function formatOrderLocation(order: LocationInput) {
  if (order.type === "domicilio") {
    return order.customer_name?.trim()
      ? `Domicilio · ${order.customer_name.trim()}`
      : "Domicilio";
  }

  if (order.type === "para_llevar") {
    return order.customer_name?.trim()
      ? `Para llevar · ${order.customer_name.trim()}`
      : "Para llevar";
  }

  const table = formatTableName(order.table_number);
  const zone = order.table_zone_name?.trim();
  return [zone, table].filter(Boolean).join(" · ") || "Comedor";
}
