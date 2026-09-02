"use server";

import { createClient } from "@/lib/supabase/server";
import { loadWhatsappOperationsConfig, quoteWhatsappDelivery } from "@/lib/whatsapp/operations.server";
import type { ConversationDeliveryQuote } from "@/lib/whatsapp/types";

export type ManualDeliveryQuoteResult =
  | { success: true; quote: ConversationDeliveryQuote }
  | { success: false; error: string };

export async function quoteManualDeliveryAction(address: string): Promise<ManualDeliveryQuoteResult> {
  try {
    const value = address.trim();
    if (value.length < 8) return { success: false, error: "Escribe una dirección más completa" };
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { success: false, error: "Tu sesión expiró. Inicia sesión nuevamente" };
    const { data: profile } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!profile?.is_active || !["owner", "admin", "waiter", "supervisor"].includes(profile.role)) {
      return { success: false, error: "No tienes permiso para cotizar domicilios" };
    }
    const config = await loadWhatsappOperationsConfig();
    const result = await quoteWhatsappDelivery({ conversationId: null, address: value, config });
    if (result.status !== "quoted") {
      return { success: false, error: "No se pudo confirmar la cobertura de ese domicilio" };
    }
    return { success: true, quote: result.quote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cotizar el domicilio" };
  }
}
