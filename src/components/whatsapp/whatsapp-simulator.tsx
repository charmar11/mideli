"use client";

import {
  Bot,
  CircleAlert,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildConversationCatalog } from "@/lib/whatsapp/catalog";
import {
  createConversation,
  handleConversationMessage,
  withDeliveryQuote,
} from "@/lib/whatsapp/conversation-engine";
import type { ConversationStage, ConversationState } from "@/lib/whatsapp/types";
import type { MenuItem } from "@/types/database";

type SimulatorMessage = {
  id: number;
  role: "customer" | "assistant";
  text: string;
};

type WhatsAppSimulatorProps = {
  menuItems: MenuItem[];
  catalogError: string | null;
  simulatorEnabled: boolean;
};

const INITIAL_MESSAGE: SimulatorMessage = {
  id: 1,
  role: "assistant",
  text: "Hola, soy el asistente de Mideli. ¿Qué te gustaría ordenar?",
};

const STAGE_LABELS: Record<ConversationStage, string> = {
  ordering: "Armando pedido",
  browsing_catalog: "Viendo menú",
  awaiting_modifiers: "Falta una opción",
  awaiting_beverage: "Ofreciendo bebida",
  awaiting_fulfillment: "Tipo de entrega",
  awaiting_address: "Falta domicilio",
  awaiting_address_reference: "Falta referencia",
  awaiting_delivery_quote: "Calculando envío",
  awaiting_payment: "Falta pago",
  awaiting_cash_tendered: "Falta efectivo",
  awaiting_confirmation: "Por confirmar",
  handoff: "Atención humana",
  confirmed: "Prueba completada",
  cancelled: "Cancelado",
};

function stageTone(stage: ConversationStage) {
  if (stage === "confirmed") return "bg-success/15 text-success";
  if (stage === "handoff" || stage === "cancelled") return "bg-danger/15 text-danger";
  if (stage !== "ordering") return "bg-warning/15 text-warning";
  return "bg-brand/15 text-brand";
}

function lineTotal(line: ConversationState["cart"][number]) {
  const extras = line.selectedModifiers.reduce((sum, item) => sum + item.price, 0);
  return (line.unitPrice + extras) * line.quantity;
}

function ConversationBubble({ message }: { message: SimulatorMessage }) {
  const customer = message.role === "customer";
  return (
    <div className={`flex items-end gap-2 ${customer ? "justify-end" : "justify-start"}`}>
      {!customer ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot aria-hidden size={16} />
        </span>
      ) : null}
      <p
        className={`max-w-[86%] rounded-2xl px-4 py-3 font-body text-sm leading-relaxed text-pretty sm:max-w-[75%] ${
          customer
            ? "rounded-br-md bg-brand text-white"
            : "rounded-bl-md bg-surface-raised text-foreground"
        }`}
      >
        {message.text}
      </p>
      {customer ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream/10 text-cream">
          <UserRound aria-hidden size={16} />
        </span>
      ) : null}
    </div>
  );
}

function LiveOrder({ state }: { state: ConversationState }) {
  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <ShoppingBag aria-hidden size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base font-bold">Comanda en vivo</h2>
          <p className="mt-0.5 font-body text-xs text-muted-foreground">
            Lo que Mideli entendió de la conversación.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 font-heading text-[10px] font-bold ${stageTone(state.stage)}`}>
          {STAGE_LABELS[state.stage]}
        </span>
      </div>

      <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {state.cart.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-muted-foreground">
              <ShoppingBag aria-hidden size={21} />
            </span>
            <p className="mt-3 font-heading text-sm font-bold">Aún no hay productos</p>
            <p className="mt-1 max-w-56 font-body text-xs text-muted-foreground">
              Escribe como lo haría un cliente. Solo aparecerán productos reales del menú.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.cart.map((line) => (
              <article key={line.id} className="rounded-xl bg-background p-3 ring-1 ring-foreground/8">
                <div className="flex items-start gap-3">
                  <span className="font-data text-sm font-bold text-brand">{line.quantity}x</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-sm font-bold">{line.name}</h3>
                    {line.selectedModifiers.length > 0 ? (
                      <p className="mt-1 font-body text-xs text-muted-foreground">
                        {line.selectedModifiers.map((item) => item.optionName).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-data text-sm font-bold text-foreground">
                    ${lineTotal(line)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        {state.serviceType ? (
          <div className="mb-3 space-y-1 font-body text-xs text-muted-foreground">
            <p>{state.serviceType === "domicilio" ? "Domicilio" : "Para recoger"}</p>
            {state.address ? <p className="line-clamp-2">{state.address}</p> : null}
            {state.payment ? <p>Pago: {state.payment.method}</p> : null}
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-4">
          <span className="font-heading text-xs font-bold text-muted-foreground">TOTAL DE PRUEBA</span>
          <strong className="font-data text-3xl font-bold tabular-nums text-gold">${state.total}</strong>
        </div>
      </div>
    </aside>
  );
}

export function WhatsAppSimulator({
  menuItems,
  catalogError,
  simulatorEnabled,
}: WhatsAppSimulatorProps) {
  const catalog = useMemo(() => buildConversationCatalog(menuItems), [menuItems]);
  const [state, setState] = useState(() => createConversation("simulator"));
  const [messages, setMessages] = useState<SimulatorMessage[]>(() => [INITIAL_MESSAGE]);
  const [draft, setDraft] = useState("");
  const messageId = useRef(2);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const terminal = state.stage === "confirmed" || state.stage === "cancelled";

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function resetConversation() {
    setState(createConversation("simulator"));
    setMessages([INITIAL_MESSAGE]);
    setDraft("");
    messageId.current = 2;
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customerText = draft.trim();
    if (!customerText || terminal || catalog.items.length === 0) return;

    const engineResult = handleConversationMessage(state, customerText, catalog);
    const next =
      engineResult.action === "request_delivery_quote"
        ? {
            ...engineResult,
            action: "none" as const,
            state: withDeliveryQuote(engineResult.state, {
              id: null,
              formattedAddress: engineResult.state.address ?? "Domicilio de prueba",
              colony: "Zona de prueba",
              latitude: 27.4828,
              longitude: -109.9304,
              distanceMeters: 3500,
              baseFee: 30,
              surcharge: 0,
              totalFee: 30,
            }),
            reply:
              "Simulación: el envío calculado es de $30. ¿Pagarás en efectivo o por transferencia?",
          }
        : engineResult;
    const assistantText =
      next.action === "request_order_creation"
        ? "Simulación completada. El pedido no fue creado ni enviado a Cocina porque el modo seguro está activo."
        : next.reply;

    setState(next.state);
    setMessages((current) => [
      ...current,
      { id: messageId.current++, role: "customer", text: customerText },
      { id: messageId.current++, role: "assistant", text: assistantText },
    ]);
    setDraft("");
  }

  if (!simulatorEnabled) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-5">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <ShieldCheck aria-hidden className="mx-auto text-brand" size={28} />
          <h1 className="mt-4 font-heading text-xl font-bold">Canal todavía desactivado</h1>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            La simulación solo está disponible durante el desarrollo local.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background p-3 pb-8 sm:p-5 lg:overflow-hidden lg:p-6">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 lg:h-full lg:min-h-0">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/20">
              <MessageCircleMore aria-hidden size={21} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-xl font-bold sm:text-2xl">Pedidos por WhatsApp</h1>
                <span className="rounded-full bg-warning/15 px-2.5 py-1 font-heading text-[10px] font-bold text-warning">
                  SIMULADOR LOCAL
                </span>
              </div>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Prueba el flujo con el menú real sin crear pedidos ni afectar el turno.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={resetConversation}
            className="h-11 gap-2 px-4 font-heading font-bold"
          >
            <RefreshCw aria-hidden size={16} />
            Nueva conversación
          </Button>
        </header>

        {catalogError || catalog.items.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-danger">
            <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={18} />
            <p className="font-body text-sm">
              {catalogError ?? "No hay productos activos para probar la conversación."}
            </p>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:min-h-0">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Bot aria-hidden size={19} />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-success" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-sm font-bold">Asistente Mideli</h2>
                <p className="font-body text-xs text-muted-foreground">Modo seguro, sin escrituras</p>
              </div>
              <ShieldCheck aria-label="Modo seguro activo" className="text-success" size={18} />
            </div>

            <div
              className="pos-scroll min-h-0 flex-1 space-y-4 overflow-y-auto bg-ink/35 p-4 sm:p-5"
              aria-live="polite"
            >
              {messages.map((message) => (
                <ConversationBubble key={message.id} message={message} />
              ))}
              <div ref={conversationEnd} />
            </div>

            <form onSubmit={submitMessage} className="flex gap-2 border-t border-border bg-surface p-3 sm:p-4">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={terminal ? "Inicia una conversación nueva" : "Escribe como un cliente..."}
                disabled={terminal || catalog.items.length === 0}
                aria-label="Mensaje del cliente"
                className="h-12 rounded-xl bg-background px-4 font-body"
              />
              <Button
                type="submit"
                disabled={!draft.trim() || terminal || catalog.items.length === 0}
                aria-label="Enviar mensaje de prueba"
                className="h-12 w-12 rounded-xl bg-brand text-white hover:bg-brand-hover"
              >
                <Send aria-hidden size={18} />
              </Button>
            </form>
          </section>

          <LiveOrder state={state} />
        </div>
      </div>
    </div>
  );
}
