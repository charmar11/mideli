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
    label: "Avanzar pedidos desde Estado",
    description: "Iniciar preparación y marcar pedidos listos desde Mesero · Estado",
  },
  {
    code: "business.access_kitchen",
    label: "Pantalla Cocina",
    description: "Mostrar la estación de cocina separada (KDS)",
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

/** New businesses can advance orders from Estado; a dedicated KDS is optional. */
export const DEFAULT_BUSINESS_OWNER_CAPABILITY_CODES =
  BUSINESS_OWNER_CAPABILITY_CODES.filter(
    (code) => code !== "business.access_kitchen",
  );
