import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuItem } from "@/types/database";
import { buildConversationCatalog } from "./catalog";
import {
  isMissingMultibusinessSchemaError,
  resolveMideliBusinessScope,
} from "./mideli-business.server";
import type { ConversationCatalog } from "./types";

export async function loadWhatsappCatalog(): Promise<ConversationCatalog> {
  const admin = createAdminClient();
  const scope = await resolveMideliBusinessScope(admin);
  const loadLegacy = async () => {
    const result = await admin
      .from("menu_items")
      .select(
        "id,category_id,name,description,price,is_active,whatsapp_enabled,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(id,name,sort_order,is_active)"
      )
      .eq("is_active", true)
      .eq("categories.is_active", true)
      .order("sort_order", { ascending: true });
    if (result.error) throw result.error;
    return result.data ?? [];
  };

  let data: unknown[];
  if (scope.boundaryAvailable && scope.businessId) {
    const result = await admin
      .from("menu_items")
      .select(
        "id,business_id,category_id,name,description,price,is_active,whatsapp_enabled,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(id,name,sort_order,is_active)"
      )
      .eq("business_id", scope.businessId)
      .eq("is_active", true)
      .eq("categories.is_active", true)
      .order("sort_order", { ascending: true });
    if (!result.error) {
      data = result.data ?? [];
    } else if (isMissingMultibusinessSchemaError(result.error)) {
      data = await loadLegacy();
    } else {
      throw result.error;
    }
  } else {
    data = await loadLegacy();
  }
  return buildConversationCatalog(data as unknown as MenuItem[]);
}
