export interface BusinessContextSelectionOption {
  business_id: string;
  capability_codes: readonly string[] | null;
  membership_scope_type?: "platform" | "organization" | "business" | null;
  membership_role_code?: string | null;
}

export interface BusinessOrderSelectionOption
  extends BusinessContextSelectionOption {
  business_lifecycle_status: string;
  business_license_available?: boolean;
}

const ORDER_READ_CAPABILITIES = new Set([
  "business.operate_orders",
  "business.charge_orders",
  "business.update_preparation",
  "organization.operate_orders",
  "organization.charge_orders",
]);

export function hasOrderReadCapability(context: BusinessContextSelectionOption) {
  return (context.capability_codes ?? []).some((capability) =>
    ORDER_READ_CAPABILITIES.has(capability)
  );
}

export function canManageOrderPreparation(
  context: BusinessOrderSelectionOption | null | undefined,
) {
  return (
    context?.business_lifecycle_status === "active" &&
    (context.capability_codes ?? []).includes("business.update_preparation")
  );
}

export function getBusinessCashCapabilities(
  context: BusinessContextSelectionOption | null | undefined,
) {
  const capabilities = context?.capability_codes ?? [];
  const canManageCash = capabilities.includes("business.manage_cash");

  return {
    canManageCash,
    canOpenCash:
      canManageCash || capabilities.includes("business.open_cash"),
    canCloseCash:
      canManageCash || capabilities.includes("business.close_cash"),
  };
}

export interface CashBusinessSelectionOption extends BusinessContextSelectionOption {
  business_display_name: string;
  business_lifecycle_status: string;
  business_license_available?: boolean;
}

export function getCashAccessibleBusinessContexts<
  T extends CashBusinessSelectionOption,
>(contexts: readonly T[]) {
  return contexts.flatMap((context) => {
    if (
      context.business_lifecycle_status !== "active" ||
      context.business_license_available !== true
    ) {
      return [];
    }

    const cashAccess = getBusinessCashCapabilities(context);
    if (
      !cashAccess.canOpenCash &&
      !cashAccess.canCloseCash &&
      !cashAccess.canManageCash
    ) {
      return [];
    }

    return [{
      business_id: context.business_id,
      business_display_name: context.business_display_name,
      ...cashAccess,
    }];
  });
}

/**
 * Organization-scoped global waiters handle dine-in orders for other locals;
 * delivery and takeout remain with each business's own team. Business-scoped
 * memberships are local staff and retain the full service workflow.
 */
export function filterOperationalOrdersByMembershipScope<
  T extends { business_id?: string | null; type: string },
  C extends BusinessContextSelectionOption,
>(orders: readonly T[], contexts: readonly C[]): T[] {
  const globalWaiterBusinessIds = new Set(
    contexts
      .filter(
        (context) =>
          context.membership_scope_type === "organization" &&
          context.membership_role_code === "global_waiter"
      )
      .map((context) => context.business_id)
  );

  return orders.filter(
    (order) =>
      !order.business_id ||
      !globalWaiterBusinessIds.has(order.business_id) ||
      order.type === "comedor"
  );
}

const ORGANIZATION_WIDE_BUSINESS_ACCESS = new Set([
  "organization.operate_orders",
  "organization.charge_orders",
  "organization.manage_global_waiters",
  "platform.manage_businesses",
]);

export function hasPlatformConsoleAccess(capabilities: readonly string[]) {
  return capabilities.includes("platform.manage_businesses");
}

export function resolveBusinessBrandingContext<
  T extends BusinessContextSelectionOption,
>(contexts: readonly T[]) {
  if (
    contexts.some((context) =>
      (context.capability_codes ?? []).some((capability) =>
        ORGANIZATION_WIDE_BUSINESS_ACCESS.has(capability)
      )
    )
  ) {
    return null;
  }

  const businessScopedContexts = contexts.filter((context) =>
    (context.capability_codes ?? []).some((capability) =>
      capability.startsWith("business.")
    )
  );

  return businessScopedContexts.length === 1 ? businessScopedContexts[0] : null;
}

export function canSelectBusinessContext(
  context: BusinessContextSelectionOption
) {
  return (context.capability_codes ?? []).some(
    (capability) =>
      capability.startsWith("business.") ||
      ORGANIZATION_WIDE_BUSINESS_ACCESS.has(capability)
  );
}

export function getSelectableBusinessContexts<T extends BusinessContextSelectionOption>(
  contexts: T[]
) {
  const authorizedContexts = contexts.filter(canSelectBusinessContext);
  return authorizedContexts.length > 0 ? authorizedContexts : contexts;
}

export function getOrderableBusinessContexts<
  T extends BusinessOrderSelectionOption,
>(contexts: T[]) {
  return contexts.filter(
    (context) =>
      context.business_lifecycle_status === "active" &&
      context.business_license_available === true &&
      (context.capability_codes ?? []).some(
        (capability) =>
          capability === "business.operate_orders" ||
          capability === "organization.operate_orders"
      )
  );
}

/** Active, licensed businesses whose order records the user may read. */
export function getOrderReadableBusinessContexts<
  T extends BusinessOrderSelectionOption,
>(contexts: T[]) {
  return contexts.filter(
    (context) =>
      context.business_lifecycle_status === "active" &&
      context.business_license_available === true &&
      hasOrderReadCapability(context)
  );
}

/** History deletion is reserved for the business owner in modern contexts. */
export function canDeleteBusinessOrderHistory(
  context: BusinessContextSelectionOption | null | undefined,
  legacyProfileRole?: string | null,
) {
  if (context) return context.membership_role_code === "business_owner";
  return legacyProfileRole === "owner" || legacyProfileRole === "admin";
}

/** Menus the waiter is authorized to see, including neutral disabled entries. */
export function getMenuSelectableBusinessContexts<
  T extends BusinessOrderSelectionOption,
>(contexts: T[]) {
  return contexts.filter(
    (context) =>
      context.business_lifecycle_status === "active" &&
      (context.capability_codes ?? []).some(
        (capability) =>
          capability === "business.operate_orders" ||
          capability === "organization.operate_orders"
      )
  );
}

export function resolveBusinessContextSelection<
  T extends BusinessContextSelectionOption,
>(
  activeContexts: T[],
  setupContexts: T[],
  requestedBusinessId: string | null | undefined
) {
  const authorizedActiveContexts = activeContexts.filter(
    canSelectBusinessContext
  );
  const authorizedSetupContexts = setupContexts.filter(
    canSelectBusinessContext
  );

  const requestedAuthorizedContext = [
    ...authorizedActiveContexts,
    ...authorizedSetupContexts,
  ].find((context) => context.business_id === requestedBusinessId);
  if (requestedAuthorizedContext) return requestedAuthorizedContext;

  if (authorizedActiveContexts.length > 0) return authorizedActiveContexts[0];
  if (authorizedSetupContexts.length > 0) return authorizedSetupContexts[0];

  const fallbackActiveContexts = getSelectableBusinessContexts(activeContexts);
  const fallbackSetupContexts = getSelectableBusinessContexts(setupContexts);
  return (
    fallbackActiveContexts.find(
      (context) => context.business_id === requestedBusinessId
    ) ??
    fallbackSetupContexts.find(
      (context) => context.business_id === requestedBusinessId
    ) ??
    fallbackActiveContexts[0] ??
    fallbackSetupContexts[0] ??
    null
  );
}
