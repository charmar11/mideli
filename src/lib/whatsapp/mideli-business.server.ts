import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type MideliBusinessScope = {
  businessId: string | null;
  boundaryAvailable: boolean;
};

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "");
  const value = error as { message?: unknown; details?: unknown };
  return [value.message, value.details].filter((item) => typeof item === "string").join(" ");
}

/**
 * Only treats an absent, not-yet-deployed multibusiness schema as compatible.
 * Other database failures must surface instead of silently widening a query.
 */
export function isMissingMultibusinessSchemaError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return (
    text.includes("schema cache") &&
    (text.includes("organizations") || text.includes("businesses") || text.includes("business_id"))
  ) || (
    text.includes("does not exist") &&
    (text.includes("organizations") || text.includes("businesses") || text.includes("business_id"))
  );
}

export async function resolveMideliBusinessScope(
  admin: AdminClient
): Promise<MideliBusinessScope> {
  const organizationResult = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "rincon-404-food-park")
    .maybeSingle();

  if (organizationResult.error) {
    if (isMissingMultibusinessSchemaError(organizationResult.error)) {
      return { businessId: null, boundaryAvailable: false };
    }
    throw organizationResult.error;
  }

  if (!organizationResult.data?.id) {
    throw new Error("No se encontró la organización configurada para Mideli");
  }

  const businessResult = await admin
    .from("businesses")
    .select("id")
    .eq("organization_id", organizationResult.data.id)
    .eq("slug", "mideli")
    .eq("lifecycle_status", "active")
    .maybeSingle();

  if (businessResult.error) throw businessResult.error;
  if (!businessResult.data?.id) {
    throw new Error("No se encontró el negocio Mideli activo");
  }

  return { businessId: businessResult.data.id, boundaryAvailable: true };
}
