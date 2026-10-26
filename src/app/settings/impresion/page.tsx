import Link from "next/link";
import { ArrowLeft, Building2, Printer } from "lucide-react";
import { BusinessReceiptSettingsManager } from "@/components/admin/business-receipt-settings-manager";
import { PrintStationManager } from "@/components/admin/print-station-manager";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";
import type { BusinessContextRow } from "@/types/multibusiness";

export default async function PrintStationPage() {
  const supabase = await createClient();
  const [selected, contextResult] = await Promise.all([
    getSelectedBusinessContext(supabase),
    supabase.rpc("get_my_multibusiness_context"),
  ]);
  const business = ((contextResult.data ?? []) as BusinessContextRow[]).find(
    (row) => row.business_id === selected.businessId,
  );
  const businessName = business?.business_display_name ?? "Negocio";
  const canManageKitchenPrint = Boolean(
    business?.capability_codes.includes("business.access_kitchen") &&
      business.capability_codes.includes("business.update_preparation"),
  );

  return (
    <main className="mideli-settings-screen min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 shadow-sm sm:px-6">
        <Link
          href="/dashboard"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          aria-label="Volver al sistema"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <Printer size={19} />
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-bold text-foreground">Impresión</h1>
          <p className="flex items-center gap-1 truncate font-body text-xs text-muted-foreground">
            <Building2 size={12} /> {businessName}
          </p>
        </div>
      </header>

      <div className="mideli-page-scroll pos-scroll overflow-y-auto p-3 pb-10 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <BusinessReceiptSettingsManager />
          {canManageKitchenPrint ? <PrintStationManager embedded /> : null}
        </div>
      </div>
    </main>
  );
}
