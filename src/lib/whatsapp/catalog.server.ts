import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuItem } from "@/types/database";
import { buildConversationCatalog } from "./catalog";
import type { ConversationCatalog } from "./types";

export async function loadWhatsappCatalog(): Promise<ConversationCatalog> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("menu_items")
    .select(
      "id,category_id,name,description,price,is_active,whatsapp_enabled,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(id,name,sort_order,is_active)"
    )
    .eq("is_active", true)
    .eq("categories.is_active", true)
    .order("sort_order", { ascending: true });
  if (!error) return buildConversationCatalog((data ?? []) as unknown as MenuItem[]);

  const fallback = await admin
    .from("menu_items")
    .select(
      "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at,categories!inner(id,name,sort_order,is_active)"
    )
    .eq("is_active", true)
    .eq("categories.is_active", true)
    .order("sort_order", { ascending: true });
  if (fallback.error) throw fallback.error;
  return buildConversationCatalog((fallback.data ?? []) as unknown as MenuItem[]);
}
