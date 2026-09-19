import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { APP_LICENSE_ID, resolveLicense, type AppLicenseRecord } from "@/lib/license";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/multibusiness/constants";
import type { BusinessContextRow } from "@/types/multibusiness";

const protectedRoutes = ["/dashboard", "/menu", "/settings"];
const adminRoutes = ["/menu", "/settings"];
const ROLE_HEADER = "x-mideli-role";
const USER_NAME_HEADER = "x-mideli-user-name";
const CAPABILITIES_HEADER = "x-mideli-capabilities";
const SESSION_RECOVERY_ROUTE = "/reconectando";

function getRoleHome(role: string) {
  return role === "kitchen" ? "/dashboard/cocina" : "/dashboard/mesero";
}

function isAdminRole(role: string) {
  return role === "owner" || role === "admin";
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

function canUseAdminRoute(
  pathname: string,
  role: string,
  capabilities: string[]
) {
  if (isAdminRole(role)) return true;
  if (pathname.startsWith("/menu")) {
    return hasCapability(capabilities, "business.manage_catalog");
  }
  if (pathname.startsWith("/settings/mesas")) {
    return hasCapability(capabilities, "organization.manage_tables");
  }
  if (pathname.startsWith("/settings/caja")) {
    return hasCapability(capabilities, "business.manage_cash");
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
  if (contexts.length === 0) return [];

  const requestedBusinessId = request.cookies.get(SELECTED_BUSINESS_COOKIE)?.value;
  const selected =
    contexts.find((context) => context.business_id === requestedBusinessId) ??
    contexts.find((context) => context.business_lifecycle_status === "active") ??
    contexts[0];
  if (!selected) return [];

  const organizationCapabilities = contexts
    .filter((context) => context.organization_id === selected.organization_id)
    .flatMap((context) =>
      context.capability_codes.filter((capability) =>
        capability.startsWith("organization.")
      )
    );

  return Array.from(
    new Set([...selected.capability_codes, ...organizationCapabilities])
  );
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
  requestHeaders.delete(CAPABILITIES_HEADER);

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

  if (userId && (isProtected || isAuth || isLicenseBlockedRoute)) {
    const { data: licenseRecord, error: licenseError } = await supabase
      .from("app_license")
      .select("id, status, valid_until, updated_at")
      .eq("id", APP_LICENSE_ID)
      .maybeSingle();

    if (!licenseError && licenseRecord) {
      const license = resolveLicense(licenseRecord as AppLicenseRecord);
      if (!license.isActive && !isLicenseBlockedRoute) {
        return redirectWithAuth("/sistema-bloqueado");
      }
      if (license.isActive && isLicenseBlockedRoute) {
        return redirectWithAuth("/dashboard");
      }
    }
  }

  let profile: {
    role: string;
    is_active: boolean;
    full_name: string | null;
  } | null = null;
  let multibusinessCapabilities: string[] = [];

  if ((isProtected || isSessionRecovery) && userId) {
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
    requestHeaders.set(ROLE_HEADER, profile.role);
    requestHeaders.set(
      USER_NAME_HEADER,
      encodeURIComponent(profile.full_name || String(claims.email || ""))
    );

    // Legacy owner/admin accounts already have the complete historical
    // navigation. Avoid an extra context round-trip for them; capability
    // resolution is needed for scoped non-admin accounts such as local staff
    // and future Coordinators.
    if (!isAdminRole(profile.role)) {
      const { data: contextRows, error: contextError } = await supabase.rpc(
        "get_my_multibusiness_context"
      );
      if (!contextError) {
        multibusinessCapabilities = resolveScopedCapabilities(
          request,
          (contextRows ?? []) as BusinessContextRow[]
        );
      }
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

  if (profile) {
    if (
      isAdminRoute &&
      !canUseAdminRoute(pathname, profile.role, multibusinessCapabilities)
    ) {
      return redirectWithAuth(getRoleHome(profile.role));
    }

    if (isAnalyticsRoute && !isAdminRole(profile.role)) {
      return redirectWithAuth(getRoleHome(profile.role));
    }

    if (
      isInventoryRoute &&
      !(
        canUseInventory(profile.role) ||
        hasCapability(multibusinessCapabilities, "business.manage_inventory")
      )
    ) {
      return redirectWithAuth(getRoleHome(profile.role));
    }

    if (
      isPosRoute &&
      !(
        canUsePos(profile.role) ||
        hasCapability(multibusinessCapabilities, "business.operate_orders") ||
        hasCapability(multibusinessCapabilities, "organization.operate_orders")
      )
    ) {
      return redirectWithAuth(getRoleHome(profile.role));
    }

    if (
      isKitchenRoute &&
      !(
        canUseKitchen(profile.role) ||
        hasCapability(multibusinessCapabilities, "business.update_preparation")
      )
    ) {
      return redirectWithAuth(getRoleHome(profile.role));
    }

    if (isWhatsappRoute && !canUseWhatsapp(profile.role)) {
      return redirectWithAuth(getRoleHome(profile.role));
    }
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
