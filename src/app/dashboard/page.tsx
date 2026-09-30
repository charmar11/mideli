import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BusinessSetupHome } from "@/components/dashboard/business-setup-home";
import { hasPlatformConsoleAccess } from "@/lib/multibusiness/business-context-selection";

const SETUP_CAPABILITIES = [
  "business.manage_catalog",
  "business.manage_inventory",
  "business.manage_staff",
] as const;

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const role = requestHeaders.get("x-mideli-role");
  const multibusinessContextAvailable =
    requestHeaders.get("x-mideli-multibusiness-context") === "available";
  const capabilityCodes = (requestHeaders.get("x-mideli-capabilities") ?? "")
      .split(",")
      .map((capability) => capability.trim())
      .filter(Boolean);
  const capabilities = new Set(capabilityCodes);

  if (multibusinessContextAvailable) {
    if (hasPlatformConsoleAccess(capabilityCodes)) {
      redirect("/settings/negocios");
    }
    if (
      capabilities.has("business.operate_orders") ||
      capabilities.has("organization.operate_orders")
    ) {
      redirect("/dashboard/mesero");
    }
    if (capabilities.has("business.update_preparation")) {
      redirect("/dashboard/cocina");
    }
    if (SETUP_CAPABILITIES.some((capability) => capabilities.has(capability))) {
      return <BusinessSetupHome capabilities={[...capabilities]} />;
    }
    if (capabilities.has("organization.manage_tables")) {
      redirect("/settings/mesas");
    }
    redirect("/dashboard/sin-acceso");
  }

  redirect(role === "kitchen" ? "/dashboard/cocina" : "/dashboard/mesero");
}
