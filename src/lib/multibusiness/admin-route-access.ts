function isAdminRole(role: string) {
  return role === "owner" || role === "admin";
}

function hasCapability(capabilities: string[], capability: string) {
  return capabilities.includes(capability);
}

export function canUseAdminRoute(
  pathname: string,
  role: string,
  capabilities: string[],
  multibusinessContextAvailable: boolean
) {
  if (pathname.startsWith("/settings/negocios")) {
    return hasCapability(capabilities, "platform.manage_businesses");
  }
  if (pathname.startsWith("/settings/licencias")) {
    return hasCapability(capabilities, "platform.manage_business_licenses");
  }
  if (isAdminRole(role) && !multibusinessContextAvailable) return true;
  if (pathname.startsWith("/settings/clientes")) {
    return hasCapability(capabilities, "business.manage_staff");
  }
  if (pathname.startsWith("/settings/entregas")) {
    return (
      hasCapability(capabilities, "business.manage_catalog") ||
      hasCapability(capabilities, "platform.manage_businesses")
    );
  }
  if (pathname.startsWith("/settings/plataformas")) {
    return (
      hasCapability(capabilities, "business.manage_catalog") ||
      hasCapability(capabilities, "platform.manage_businesses")
    );
  }
  if (pathname.startsWith("/menu")) {
    return hasCapability(capabilities, "business.manage_catalog");
  }
  if (pathname.startsWith("/settings/mesas")) {
    return hasCapability(capabilities, "organization.manage_tables");
  }
  if (pathname.startsWith("/settings/caja")) {
    return hasCapability(capabilities, "business.manage_cash");
  }
  if (pathname.startsWith("/settings/impresion")) {
    return hasCapability(capabilities, "business.manage_catalog");
  }
  if (pathname.startsWith("/settings/diagnostico")) {
    return (
      isAdminRole(role) &&
      (hasCapability(capabilities, "platform.manage_businesses") ||
        hasCapability(capabilities, "business.manage_catalog") ||
        hasCapability(capabilities, "business.manage_cash"))
    );
  }
  if (pathname === "/settings") {
    return (
      hasCapability(capabilities, "business.manage_staff") ||
      hasCapability(capabilities, "organization.manage_global_waiters")
    );
  }
  return false;
}
