export const BUSINESS_OWNER_CAPABILITIES = [
  {
    code: "business.manage_catalog",
    label: "Catálogo",
    description: "Menú, categorías, precios y variaciones",
  },
  {
    code: "business.manage_inventory",
    label: "Inventario",
    description: "Insumos, recetas, compras y existencias",
  },
  {
    code: "business.operate_orders",
    label: "Pedidos",
    description: "Crear y operar pedidos del negocio",
  },
  {
    code: "business.update_preparation",
    label: "Cocina",
    description: "Preparación y estados de los pedidos",
  },
  {
    code: "business.charge_orders",
    label: "Cobros",
    description: "Registrar y corregir cobros",
  },
  {
    code: "business.manage_cash",
    label: "Caja",
    description: "Abrir, operar y cerrar caja",
  },
  {
    code: "business.manage_staff",
    label: "Personal",
    description: "Crear y administrar personal local",
  },
] as const;

export type BusinessOwnerCapabilityCode =
  (typeof BUSINESS_OWNER_CAPABILITIES)[number]["code"];

export const BUSINESS_OWNER_CAPABILITY_CODES: BusinessOwnerCapabilityCode[] =
  BUSINESS_OWNER_CAPABILITIES.map((capability) => capability.code);
