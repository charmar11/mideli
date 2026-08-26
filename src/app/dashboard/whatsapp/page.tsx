import { WhatsAppSimulator } from "@/components/whatsapp/whatsapp-simulator";
import { createClient } from "@/lib/supabase/server";
import type { MenuItem } from "@/types/database";

export default async function WhatsAppPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <WhatsAppSimulator
      menuItems={(data ?? []) as MenuItem[]}
      catalogError={error ? "No se pudo cargar el menú para la simulación." : null}
      simulatorEnabled={process.env.NODE_ENV !== "production"}
    />
  );
}
