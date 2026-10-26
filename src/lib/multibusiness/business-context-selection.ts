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
  "business.access_kitchen",
  "organization.operate_orders",
  "organization.charge_orders",
]);

export function hasOrderReadCapability(context: BusinessContextSelectionOption) {
  if (
    context.membership_scope_type === "organization" &&
    context.membership_role_code === "global_waiter"
  ) {
    // RLS limits every global waiter to dine-in rows, regardless of grants.
    return true;
  }

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

export function canAccessKitchenScreen(
  context: BusinessOrderSelectionOption | null | undefined,
) {
  return (
    context?.business_lifecycle_status === "active" &&
    (context.capability_codes ?? []).includes("business.access_kitchen")
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

export function getBusinessesMissingOpenCashShift(
  businessIds: readonly string[],
  shifts: readonly (
    | { business_id?: string | null; status?: string | null }
    | null
    | undefined
  )[],
) {
  const openBusinessIds = new Set(
    shifts.flatMap((shift) =>
      shift?.business_id && shift.status === "open" ? [shift.business_id] : [],
    ),
  );

  return [...new Set(businessIds)].filter(
    (businessId) => !openBusinessIds.has(businessId),
  );
}

/**
 * Organization-scoped global waiters only see dine-in orders in every
 * business. Business-specific operational grants do not expose takeout,
 * delivery, or third-party platform orders to a global waiter.
 */
export function filterOperationalOrdersByMembershipScope<
  T extends {
    business_id?: string | null;
    type: string;
    marketplace_platform?: string | null;
  },
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
      (order.type === "comedor" && !order.marketplace_platform)
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

/** Active, licensed businesses whose order rows RLS can expose to this session. */
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

/**
 * Owners may delete directly. Staff with the business-scoped order-operation
 * capability may request deletion, but the server must require the owner PIN.
 */
export function canDeleteBusinessOrderHistory(
  context: BusinessContextSelectionOption | null | undefined,
  legacyProfileRole?: string | null,
) {
  if (context) {
    return (
      context.membership_role_code === "business_owner" ||
      (context.capability_codes ?? []).includes("business.operate_orders")
    );
  }
  return legacyProfileRole === "owner" || legacyProfileRole === "admin";
}

export function canDeleteBusinessOrderHistoryForType(
  context: BusinessContextSelectionOption | null | undefined,
  orderType: string,
  legacyProfileRole?: string | null,
) {
  if (!canDeleteBusinessOrderHistory(context, legacyProfileRole)) return false;

  const isOrganizationScopedGlobalWaiter =
    context?.membership_scope_type === "organization" &&
    context.membership_role_code === "global_waiter";

  return !isOrganizationScopedGlobalWaiter || orderType === "comedor";
}

/** Non-owners must authorize a history deletion with this business's owner PIN. */
export function requiresBusinessOwnerPinForOrderDeletion(
  context: BusinessContextSelectionOption | null | undefined,
) {
  return Boolean(
    context &&
      context.membership_role_code !== "business_owner" &&
      (context.capability_codes ?? []).includes("business.operate_orders")
  );
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
