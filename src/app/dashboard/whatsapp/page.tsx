import Link from "next/link";
import { WhatsAppControlCenter } from "@/components/whatsapp/whatsapp-control-center";
import { getWhatsappControlDataAction } from "@/lib/actions/whatsapp";
import { createClient } from "@/lib/supabase/server";
import type { MenuItem } from "@/types/database";

export default async function WhatsAppPage() {
  const supabase = await createClient();
  const controlPromise = getWhatsappControlDataAction();
  const primaryCatalogPromise = supabase
    .from("menu_items")
    .select(
      "id,category_id,name,description,price,is_active,whatsapp_enabled,sort_order,modifiers,image_url,created_at,updated_at,categories(id,name,sort_order,is_active)"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const [control, primaryCatalog] = await Promise.all([
    controlPromise,
    primaryCatalogPromise,
  ]);
  if (!control.success) {
    return (
      <main className="flex min-h-full items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Canal de WhatsApp
          </p>
          <h1 className="mt-2 text-2xl font-bold">No se pudo abrir el control</h1>
          <p className="mt-3 text-sm text-muted-foreground">{control.error}</p>
          <Link
            href="/dashboard/mesero"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
          >
            Volver al punto de venta
          </Link>
        </section>
      </main>
    );
  }
  let catalogData: unknown[] = primaryCatalog.data ?? [];
  let catalogLoadError = primaryCatalog.error;
  if (primaryCatalog.error) {
    const fallbackCatalog = await supabase
      .from("menu_items")
      .select(
        "id,category_id,name,description,price,is_active,sort_order,modifiers,image_url,created_at,updated_at,categories(id,name,sort_order,is_active)"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    catalogData = fallbackCatalog.data ?? [];
    catalogLoadError = fallbackCatalog.error;
  }

  return (
    <WhatsAppControlCenter
      data={control.data}
      menuItems={catalogData as MenuItem[]}
      catalogError={catalogLoadError ? "No se pudo cargar el menú para la simulación." : null}
      simulatorEnabled={process.env.NODE_ENV !== "production"}
    />
  );
}
