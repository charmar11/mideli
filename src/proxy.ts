import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/multibusiness/constants";
import {
  canSelectBusinessContext,
  resolveBusinessContextSelection,
} from "@/lib/multibusiness/business-context-selection";
import type { BusinessContextRow } from "@/types/multibusiness";

const protectedRoutes = ["/dashboard", "/menu", "/settings"];
const adminRoutes = ["/menu", "/settings"];
const ROLE_HEADER = "x-mideli-role";
const USER_NAME_HEADER = "x-mideli-user-name";
const USER_ID_HEADER = "x-mideli-user-id";
const CAPABILITIES_HEADER = "x-mideli-capabilities";
const MULTIBUSINESS_CONTEXT_HEADER = "x-mideli-multibusiness-context";
const WHATSAPP_ACCESS_HEADER = "x-mideli-whatsapp-access";
const SESSION_RECOVERY_ROUTE = "/reconectando";
const SETUP_CAPABILITIES = new Set([
  "business.manage_catalog",
  "business.manage_inventory",
  "business.manage_staff",
]);
const MISSING_MULTIBUSINESS_CONTEXT_CODES = new Set([
  "PGRST202",
  "42883",
  "42P01",
]);

function getRoleHome(role: string) {
  return role === "kitchen" ? "/dashboard/cocina" : "/dashboard/mesero";
}

function getScopedHome(
  role: string,
  capabilities: string[],
  multibusinessContextAvailable: boolean
) {
  if (!multibusinessContextAvailable) return getRoleHome(role);

  if (hasCapability(capabilities, "platform.manage_business_licenses")) {
    return "/settings/licencias";
  }
  if (hasCapability(capabilities, "platform.manage_businesses")) {
    return "/settings/negocios";
  }
  if (
    hasCapability(capabilities, "business.operate_orders") ||
    hasCapability(capabilities, "organization.operate_orders")
  ) {
    return "/dashboard/mesero";
  }
  if (hasCapability(capabilities, "business.update_preparation")) {
    return "/dashboard/cocina";
  }
  if (hasCapability(capabilities, "business.manage_cash")) {
    return "/settings/caja";
  }
  if (hasCapability(capabilities, "business.manage_inventory")) {
    return "/settings/inventario";
  }
  if (hasCapability(capabilities, "business.manage_catalog")) {
    return "/menu";
  }
  if (
    hasCapability(capabilities, "business.manage_staff") ||
    hasCapability(capabilities, "organization.manage_global_waiters")
  ) {
    return "/settings";
  }
  if (
    capabilities.some((capability) => SETUP_CAPABILITIES.has(capability))
  ) {
    return "/dashboard";
  }
  if (hasCapability(capabilities, "organization.manage_tables")) {
    return "/settings/mesas";
  }

  return "/dashboard/sin-acceso";
}

function isAdminRole(role: string) {
  return role === "owner" || role === "admin";
}

function roleForScopedBusiness(profileRole: string, context: BusinessContextRow | undefined) {
  if (!context) return profileRole;
  if (context.membership_scope_type === "business") {
    switch (context.membership_role_code) {
      case "business_owner":
        return "owner";
      case "local_kitchen":
        return "kitchen";
      case "local_supervisor":
        return "supervisor";
      case "local_waiter":
      case "business_staff":
      default:
        return "waiter";
    }
  }
  if (
    context.membership_scope_type === "organization" &&
    context.membership_role_code === "global_waiter"
  ) {
    return "waiter";
  }
  return profileRole;
}

function canUsePos(role: string) {
  return isAdminRole(role) || role === "waiter" || role === "supervisor";
}

function canUseKitchen(role: string) {
  return isAdminRole(role) || role === "kitchen" || role === "supervisor";
}

function canUseWhatsapp(role: string) {
  return isAdminRole(role) || role === "waiter" || role === "supervisor";
}

function canUseInventory(role: string) {
  return isAdminRole(role);
}

function hasCapability(capabilities: string[], capability: string) {
  return capabilities.includes(capability);
}

function canUseMideliWhatsapp(
  role: string,
  capabilities: string[],
  mideliBusinessVisible: boolean
) {
  if (!mideliBusinessVisible) return false;
  if (role === "waiter" || role === "supervisor") return true;
  return (
    hasCapability(capabilities, "business.operate_orders") ||
    hasCapability(capabilities, "organization.operate_orders")
  );
}

function canUseAdminRoute(
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

function resolveScopedCapabilities(
  request: NextRequest,
  contexts: BusinessContextRow[]
) {
  const activeContexts = contexts.filter(
    (context) =>
      context.business_lifecycle_status === "active" &&
      context.business_license_available === true
  );
  const setupContexts = contexts.filter(
    (context) =>
      (context.business_lifecycle_status === "draft" ||
        (context.business_lifecycle_status === "paused" &&
          context.business_license_available === true)) &&
      context.capability_codes.some((capability) =>
        SETUP_CAPABILITIES.has(capability)
      )
  );
  const requestedBusinessId = request.cookies.get(SELECTED_BUSINESS_COOKIE)?.value;
  const selected = resolveBusinessContextSelection(
    activeContexts,
    setupContexts,
    requestedBusinessId
  );
  if (!selected) {
    const globalCapabilities = contexts.flatMap((context) =>
      context.capability_codes.filter(
        (capability) =>
          capability.startsWith("organization.") ||
          capability.startsWith("platform."),
      ),
    );
    return {
      capabilities: Array.from(new Set(globalCapabilities)),
      selectedBusinessId: null,
    };
  }

  const organizationCapabilities = contexts
    .filter((context) => context.organization_id === selected.organization_id)
    .flatMap((context) =>
      context.capability_codes.filter((capability) =>
        capability.startsWith("organization.")
      )
    );

  const selectedCapabilities =
    selected.business_lifecycle_status === "active"
      ? selected.capability_codes
      : selected.capability_codes.filter((capability) =>
          SETUP_CAPABILITIES.has(capability)
        );

  return {
    capabilities: Array.from(
      new Set([...selectedCapabilities, ...organizationCapabilities])
    ),
    selectedBusinessId: selected.business_id,
  };
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

function safeRecoveryTarget(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuth = pathname === "/login";
  const isSessionRecovery = pathname === SESSION_RECOVERY_ROUTE;
  const isLicenseBlockedRoute = pathname === "/sistema-bloqueado";
  const isInventoryRoute = pathname.startsWith("/settings/inventario");
  const isAdminRoute =
    adminRoutes.some((route) => pathname.startsWith(route)) && !isInventoryRoute;
  const isAnalyticsRoute = pathname === "/dashboard/analiticas";
  const isPosRoute = pathname === "/dashboard/mesero";
  const isKitchenRoute = pathname === "/dashboard/cocina";
  const isWhatsappRoute = pathname === "/dashboard/whatsapp";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(ROLE_HEADER);
  requestHeaders.delete(USER_NAME_HEADER);
  requestHeaders.delete(USER_ID_HEADER);
  requestHeaders.delete(CAPABILITIES_HEADER);
  requestHeaders.delete(MULTIBUSINESS_CONTEXT_HEADER);
  requestHeaders.delete(WHATSAPP_ACCESS_HEADER);

  let cookiesToSet: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  let authResponseHeaders: Record<string, string> = {};

  const createResponse = () => {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    cookiesToSet.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options)
    );
    Object.entries(authResponseHeaders).forEach(([name, value]) =>
      response.headers.set(name, value)
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  let supabaseResponse = createResponse();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(nextCookies, headers) {
          nextCookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet = nextCookies;
          authResponseHeaders = headers;
          supabaseResponse = createResponse();
        },
      },
    }
  );

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub;

  const redirectWithAuth = (path: string, reason?: string) => {
    const url = request.nextUrl.clone();
    const [nextPathname, nextSearch = ""] = path.split("?", 2);
    url.pathname = nextPathname;
    url.search = nextSearch ? `?${nextSearch}` : "";
    if (reason) url.searchParams.set("reason", reason);

    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach(({ name, value, ...options }) =>
        response.cookies.set(name, value, options)
      );
    Object.entries(authResponseHeaders).forEach(([name, value]) =>
      response.headers.set(name, value)
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  const redirectToRecovery = () => {
    const url = request.nextUrl.clone();
    url.pathname = SESSION_RECOVERY_ROUTE;
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return redirectWithAuth(`${url.pathname}${url.search}`);
  };

  if (
    (isProtected || isLicenseBlockedRoute || isSessionRecovery) &&
    !userId &&
    claimsError &&
    hasSupabaseAuthCookie(request) &&
    !isSessionRecovery
  ) {
    return redirectToRecovery();
  }

  if ((isProtected || isLicenseBlockedRoute || isSessionRecovery) && !userId) {
    return redirectWithAuth("/login");
  }

  let profile: {
    role: string;
    is_active: boolean;
    full_name: string | null;
  } | null = null;
  let effectiveRole = "waiter";
  let multibusinessCapabilities: string[] = [];
  let multibusinessContextAvailable = false;
  let mideliBusinessVisible = false;
  let scopedContexts: BusinessContextRow[] = [];
  let hasLicensedBusinessContext = false;
  let hasDraftSetupContext = false;
  let hasGlobalWaiterContext = false;

  if ((isProtected || isSessionRecovery || isLicenseBlockedRoute || isAuth) && userId) {
    let profileResult = await supabase
      .from("profiles")
      .select("role, is_active, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (profileResult.error) {
      profileResult = await supabase
        .from("profiles")
        .select("role, is_active, full_name")
        .eq("id", userId)
        .maybeSingle();
    }

    if (profileResult.error) {
      return isSessionRecovery ? supabaseResponse : redirectToRecovery();
    }

    const nextProfile = profileResult.data;

    if (!nextProfile) {
      await supabase.auth.signOut();
      return redirectWithAuth("/login", "profile");
    }

    if (nextProfile.is_active === false) {
      await supabase.auth.signOut();
      return redirectWithAuth("/login", "inactive");
    }

    profile = nextProfile;
    effectiveRole = profile.role;
    requestHeaders.set(ROLE_HEADER, effectiveRole);
    requestHeaders.set(USER_ID_HEADER, userId);
    requestHeaders.set(
      USER_NAME_HEADER,
      encodeURIComponent(profile.full_name || String(claims.email || ""))
    );

    const [contextResult, licenseResult] = await Promise.all([
      supabase.rpc("get_my_multibusiness_context"),
      supabase.rpc("get_my_business_license_availability"),
    ]);
    const { data: contextRows, error: contextError } = contextResult;
    if (!contextError) {
      multibusinessContextAvailable = true;
      const contexts = (contextRows ?? []) as BusinessContextRow[];
      const licenseByBusinessId = new Map(
        ((licenseResult.data ?? []) as Array<{
          business_id: string;
          is_available: boolean;
        }>).map((item) => [item.business_id, item.is_available]),
      );
      scopedContexts = contexts.map((context) => ({
        ...context,
        business_license_available:
          !licenseResult.error &&
          licenseByBusinessId.get(context.business_id) === true,
      }));
      hasLicensedBusinessContext = scopedContexts.some(
        (context) =>
          context.business_lifecycle_status === "active" &&
          context.business_license_available === true &&
          canSelectBusinessContext(context),
      );
      hasDraftSetupContext = scopedContexts.some(
        (context) =>
          (context.business_lifecycle_status === "draft" ||
            (context.business_lifecycle_status === "paused" &&
              context.business_license_available === true)) &&
          context.capability_codes.some((capability) =>
            SETUP_CAPABILITIES.has(capability),
          ),
      );
      hasGlobalWaiterContext = scopedContexts.some((context) =>
        context.capability_codes.includes("organization.manage_global_waiters"),
      );
      mideliBusinessVisible = scopedContexts.some(
        (context) =>
          context.business_slug === "mideli" &&
          context.business_lifecycle_status === "active" &&
          context.business_license_available === true
      );
      const selection = resolveScopedCapabilities(request, scopedContexts);
      multibusinessCapabilities = selection.capabilities;
      const selectedContext = scopedContexts.find(
        (context) => context.business_id === selection.selectedBusinessId,
      );
      effectiveRole = roleForScopedBusiness(profile.role, selectedContext);
      requestHeaders.set(ROLE_HEADER, effectiveRole);

      if (
        selection.selectedBusinessId &&
        selection.selectedBusinessId !==
          request.cookies.get(SELECTED_BUSINESS_COOKIE)?.value
      ) {
        request.cookies.set(
          SELECTED_BUSINESS_COOKIE,
          selection.selectedBusinessId
        );
        requestHeaders.set("cookie", request.cookies.toString());
        cookiesToSet = cookiesToSet.filter(
          (cookie) => cookie.name !== SELECTED_BUSINESS_COOKIE
        );
        cookiesToSet.push({
          name: SELECTED_BUSINESS_COOKIE,
          value: selection.selectedBusinessId,
          options: {
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
            sameSite: "lax",
            secure: request.nextUrl.protocol === "https:",
          },
        });
      }
    } else if (
      !MISSING_MULTIBUSINESS_CONTEXT_CODES.has(contextError.code ?? "")
    ) {
      // If the boundary exists but cannot be evaluated, fail closed for
      // scoped staff instead of silently restoring the old role access.
      multibusinessContextAvailable = true;
    }
    if (multibusinessContextAvailable) {
      requestHeaders.set(MULTIBUSINESS_CONTEXT_HEADER, "available");
      requestHeaders.set(
        WHATSAPP_ACCESS_HEADER,
        canUseMideliWhatsapp(
          effectiveRole,
          multibusinessCapabilities,
          mideliBusinessVisible
        )
          ? "true"
          : "false"
      );
    }
    if (multibusinessCapabilities.length > 0) {
      requestHeaders.set(
        CAPABILITIES_HEADER,
        multibusinessCapabilities.join(",")
      );
    }
    supabaseResponse = createResponse();

    if (isSessionRecovery) {
      return redirectWithAuth(
        safeRecoveryTarget(request.nextUrl.searchParams.get("next"))
      );
    }
  }

  const isPlatformLicenseManager =
    hasCapability(multibusinessCapabilities, "platform.manage_business_licenses") ||
    hasCapability(multibusinessCapabilities, "platform.manage_businesses");
  const shouldShowBusinessLicenseLock = Boolean(
    userId &&
      multibusinessContextAvailable &&
      scopedContexts.length > 0 &&
      !isPlatformLicenseManager &&
      !hasGlobalWaiterContext &&
      !hasLicensedBusinessContext &&
      !hasDraftSetupContext,
  );
  if (shouldShowBusinessLicenseLock && !isLicenseBlockedRoute) {
    return redirectWithAuth("/sistema-bloqueado");
  }
  if (!shouldShowBusinessLicenseLock && isLicenseBlockedRoute) {
    return redirectWithAuth(
      hasCapability(multibusinessCapabilities, "platform.manage_business_licenses")
        ? "/settings/licencias"
        : hasCapability(multibusinessCapabilities, "platform.manage_businesses")
          ? "/settings/negocios"
          : "/dashboard",
    );
  }

  if (profile) {
    if (
      isAdminRoute &&
      !canUseAdminRoute(
        pathname,
        effectiveRole,
        multibusinessCapabilities,
        multibusinessContextAvailable
      )
    ) {
      return redirectWithAuth(
        getScopedHome(
          effectiveRole,
          multibusinessCapabilities,
          multibusinessContextAvailable
        )
      );
    }

    if (
      isAnalyticsRoute &&
      (!isAdminRole(effectiveRole) ||
        (multibusinessContextAvailable &&
          !(
            hasCapability(multibusinessCapabilities, "business.operate_orders") ||
            hasCapability(multibusinessCapabilities, "business.charge_orders") ||
            hasCapability(multibusinessCapabilities, "business.manage_cash") ||
            hasCapability(multibusinessCapabilities, "organization.charge_orders")
          )))
    ) {
      return redirectWithAuth(
        getScopedHome(
          effectiveRole,
          multibusinessCapabilities,
          multibusinessContextAvailable
        )
      );
    }

    if (
      isInventoryRoute &&
      !(
        (!multibusinessContextAvailable && canUseInventory(effectiveRole)) ||
        hasCapability(multibusinessCapabilities, "business.manage_inventory")
      )
    ) {
      return redirectWithAuth(
        getScopedHome(
          effectiveRole,
          multibusinessCapabilities,
          multibusinessContextAvailable
        )
      );
    }

    if (
      isPosRoute &&
      !(
        (!multibusinessContextAvailable && canUsePos(effectiveRole)) ||
        hasCapability(multibusinessCapabilities, "business.operate_orders") ||
        hasCapability(multibusinessCapabilities, "organization.operate_orders")
      )
    ) {
      return redirectWithAuth(
        getScopedHome(
          effectiveRole,
          multibusinessCapabilities,
          multibusinessContextAvailable
        )
      );
    }

    if (
      isKitchenRoute &&
      !(
        (!multibusinessContextAvailable && canUseKitchen(effectiveRole)) ||
        hasCapability(multibusinessCapabilities, "business.update_preparation")
      )
    ) {
      return redirectWithAuth(
        getScopedHome(
          effectiveRole,
          multibusinessCapabilities,
          multibusinessContextAvailable
        )
      );
    }

    if (
      isWhatsappRoute &&
      !(
        multibusinessContextAvailable
          ? canUseMideliWhatsapp(
              effectiveRole,
              multibusinessCapabilities,
              mideliBusinessVisible
            )
          : canUseWhatsapp(effectiveRole)
      )
    ) {
      return redirectWithAuth(
        getScopedHome(
          effectiveRole,
          multibusinessCapabilities,
          multibusinessContextAvailable
        )
      );
    }
  }

  if (isAuth && userId && request.nextUrl.searchParams.get("reason") === "scope") {
    return redirectWithAuth("/dashboard/sin-acceso");
  }

  if (isAuth && userId) {
    return redirectWithAuth("/dashboard");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/login",
    "/reconectando",
    "/sistema-bloqueado",
    "/dashboard/:path*",
    "/menu/:path*",
    "/settings/:path*",
  ],
};
