export type StaffRoleCapabilityGroup = "Pedidos y cobros" | "Caja" | "Cocina" | "Administración";

export type StaffRoleCapabilityOption = {
  code: string;
  label: string;
  description: string;
  group: StaffRoleCapabilityGroup;
};

/** Keep a business owner visible only to themselves in their local staff view. */
export function filterVisibleBusinessStaffMemberships<
  T extends { user_id: string; role_code: string },
>(memberships: readonly T[], currentUserId: string): T[] {
  return memberships.filter(
    (membership) =>
      membership.role_code !== "business_owner" ||
      membership.user_id === currentUserId,
  );
}

/** Safe, business-scoped permissions. Full cash administration is never delegable. */
export const STAFF_ROLE_CAPABILITY_OPTIONS: StaffRoleCapabilityOption[] = [
  {
    code: "business.operate_orders",
    label: "Tomar pedidos",
    description: "Crear y consultar pedidos de este negocio.",
    group: "Pedidos y cobros",
  },
  {
    code: "business.charge_orders",
    label: "Cobrar pedidos",
    description: "Registrar y corregir cobros de este negocio.",
    group: "Pedidos y cobros",
  },
  {
    code: "business.open_cash",
    label: "Abrir caja",
    description: "Iniciar el turno de caja de este negocio.",
    group: "Caja",
  },
  {
    code: "business.close_cash",
    label: "Cerrar caja",
    description: "Cerrar caja y consultar el corte recién cerrado.",
    group: "Caja",
  },
  {
    code: "business.update_preparation",
    label: "Actualizar preparación",
    description: "Cambiar los pedidos entre pendiente, preparando y listo.",
    group: "Cocina",
  },
  {
    code: "business.manage_catalog",
    label: "Administrar catálogo",
    description: "Editar categorías, productos, precios y variaciones.",
    group: "Administración",
  },
  {
    code: "business.manage_inventory",
    label: "Administrar inventario",
    description: "Gestionar insumos, recetas, compras y existencias.",
    group: "Administración",
  },
  {
    code: "business.manage_staff",
    label: "Administrar equipo",
    description: "Crear accesos locales y asignar rangos permitidos.",
    group: "Administración",
  },
];

export type BusinessStaffRole = {
  id: string;
  businessId: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  systemCode: string | null;
  isActive: boolean;
  capabilities: string[];
  assignable?: boolean;
};
