import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CocinaView } from "@/components/dashboard/cocina-view";

const LEGACY_KITCHEN_ROLES = new Set(["owner", "admin", "kitchen", "supervisor"]);

export default async function CocinaPage() {
  const requestHeaders = await headers();
  const multibusinessContextAvailable =
    requestHeaders.get("x-mideli-multibusiness-context") === "available";
  const capabilities = (requestHeaders.get("x-mideli-capabilities") ?? "")
    .split(",")
    .map((capability) => capability.trim())
    .filter(Boolean);
  const role = requestHeaders.get("x-mideli-role") ?? "";

  if (
    multibusinessContextAvailable &&
    !capabilities.includes("business.access_kitchen")
  ) {
    redirect("/dashboard/mesero");
  }
  if (!multibusinessContextAvailable && !LEGACY_KITCHEN_ROLES.has(role)) {
    redirect("/dashboard/mesero");
  }

  const canManagePreparation = multibusinessContextAvailable
    ? capabilities.includes("business.update_preparation")
    : LEGACY_KITCHEN_ROLES.has(role);

  return <CocinaView canManagePreparation={canManagePreparation} />;
}
