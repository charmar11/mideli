import Link from "next/link";
import { WhatsAppControlCenter } from "@/components/whatsapp/whatsapp-control-center";
import { getWhatsappControlDataAction } from "@/lib/actions/whatsapp";

export default async function WhatsAppPage() {
  const control = await getWhatsappControlDataAction();
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
  return <WhatsAppControlCenter data={control.data} />;
}
