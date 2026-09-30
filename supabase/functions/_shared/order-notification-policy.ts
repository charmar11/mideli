export type OrderNotificationEvent = "new_order" | "ready";

export type NotificationMembershipScope = {
  scope_type: string;
  organization_id: string | null;
  business_id: string | null;
};

export type NotificationCapabilityScope = {
  capability_code: string;
  organization_id: string | null;
  business_id: string | null;
};

export function membershipBelongsToBusiness(
  membership: NotificationMembershipScope,
  organizationId: string,
  businessId: string,
) {
  if (membership.scope_type === "platform") return true;
  if (membership.scope_type === "organization") {
    return membership.organization_id === organizationId && membership.business_id === null;
  }
  if (membership.scope_type === "business") {
    return (
      membership.organization_id === organizationId &&
      membership.business_id === businessId
    );
  }
  return false;
}

export function capabilityBelongsToBusiness(
  capability: NotificationCapabilityScope,
  organizationId: string,
  businessId: string,
) {
  if (capability.capability_code === "organization.operate_orders") {
    return capability.organization_id === organizationId && capability.business_id === null;
  }
  if (
    capability.capability_code !== "business.operate_orders" &&
    capability.capability_code !== "business.update_preparation"
  ) {
    return false;
  }
  return (
    capability.organization_id === organizationId &&
    capability.business_id === businessId
  );
}

export function canSendBusinessOrderNotification(
  event: OrderNotificationEvent,
  capabilityCodes: Iterable<string>,
) {
  const capabilities = new Set(capabilityCodes);
  return event === "new_order"
    ? capabilities.has("business.operate_orders") ||
        capabilities.has("organization.operate_orders")
    : capabilities.has("business.update_preparation");
}

export function getOrderNotificationDestination(
  event: OrderNotificationEvent,
  businessId: string | null,
  capabilityCodes: Iterable<string>,
  orderId: string,
) {
  if (!businessId) {
    return event === "new_order"
      ? `/dashboard/cocina?order=${orderId}`
      : `/dashboard/mesero?mode=status&order=${orderId}`;
  }

  const capabilities = new Set(capabilityCodes);
  const canOperateOrders =
    capabilities.has("business.operate_orders") ||
    capabilities.has("organization.operate_orders");
  const canUpdatePreparation = capabilities.has("business.update_preparation");
  const shouldOpenKitchen =
    event === "new_order" ? canUpdatePreparation : !canOperateOrders;

  return shouldOpenKitchen
    ? `/dashboard/cocina?order=${orderId}`
    : `/dashboard/mesero?mode=status&order=${orderId}`;
}
