import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { normalizeMetaWebhook } from "@/lib/whatsapp/meta-webhook";
import { createConversation } from "@/lib/whatsapp/conversation-engine";
import {
  sendMetaLocationMessage,
  sendMetaReplyButtonsMessage,
  sendMetaTextMessage,
} from "@/lib/whatsapp/meta-provider";
import { verifyMetaSignature } from "@/lib/whatsapp/meta-signature";
import { quickRepliesForState } from "@/lib/whatsapp/quick-replies";

test("valida la firma de Meta sobre el cuerpo crudo", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "app-secret-de-prueba";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  expect(verifyMetaSignature(body, signature, secret)).toBe(true);
  expect(verifyMetaSignature(`${body} `, signature, secret)).toBe(false);
  expect(verifyMetaSignature(body, null, secret)).toBe(false);
});

test("normaliza mensajes entrantes y estados sin conservar el payload completo", () => {
  const normalized = normalizeMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-test",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-test" },
              contacts: [
                {
                  wa_id: "526440000000",
                  profile: { name: "María" },
                },
              ],
              messages: [
                {
                  id: "wamid.message-1",
                  from: "+52 (644) 000-0000",
                  timestamp: "1787612400",
                  type: "text",
                  text: { body: "Quiero un California" },
                },
              ],
              statuses: [
                {
                  id: "wamid.outbound-1",
                  recipient_id: "526440000000",
                  status: "delivered",
                  timestamp: "1787612401",
                },
              ],
            },
          },
        ],
      },
    ],
  });

  expect(normalized.messages).toEqual([
    {
      id: "wamid.message-1",
      phone: "526440000000",
      customerName: "María",
      phoneNumberId: "phone-test",
      timestamp: "1787612400",
      type: "text",
      text: "Quiero un California",
      location: null,
    },
  ]);
  expect(normalized.statuses).toEqual([
    {
      messageId: "wamid.outbound-1",
      phone: "526440000000",
      status: "delivered",
      timestamp: "1787612401",
    },
  ]);
});

test("el adaptador de Meta envía texto sin exponer el token en el resultado", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ messages: [{ id: "wamid.sent-1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const sent = await sendMetaTextMessage(
    {
      to: "+52 1 644 000 0000",
      body: "Tu pedido está listo.",
    },
    {
      graphApiVersion: "v25.0",
      phoneNumberId: "phone-test",
      accessToken: "temporary-test-token",
    },
    fetcher
  );

  expect(sent).toEqual({ messageId: "wamid.sent-1" });
  expect(requestUrl).toBe("https://graph.facebook.com/v25.0/phone-test/messages");
  expect(requestInit?.method).toBe("POST");
  expect(requestInit?.headers).toMatchObject({
    Authorization: "Bearer temporary-test-token",
    "Content-Type": "application/json",
  });
  expect(JSON.parse(String(requestInit?.body))).toMatchObject({
    messaging_product: "whatsapp",
    to: "526440000000",
    type: "text",
  });
});

test("el adaptador de Meta envía el punto nativo de la dirección candidata", async () => {
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    requestInit = init;
    return new Response(JSON.stringify({ messages: [{ id: "wamid.location-1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await sendMetaLocationMessage(
    {
      to: "526440000000",
      latitude: 27.493,
      longitude: -109.94,
      name: "¿Es aquí?",
      address: "C. Chihuahua 110, Centro, Ciudad Obregón",
    },
    {
      graphApiVersion: "v25.0",
      phoneNumberId: "phone-test",
      accessToken: "temporary-test-token",
    },
    fetcher
  );

  expect(JSON.parse(String(requestInit?.body))).toMatchObject({
    messaging_product: "whatsapp",
    to: "526440000000",
    type: "location",
    location: {
      latitude: 27.493,
      longitude: -109.94,
      name: "¿Es aquí?",
      address: "C. Chihuahua 110, Centro, Ciudad Obregón",
    },
  });
});

test("el adaptador de Meta envía decisiones cortas como botones de respuesta", async () => {
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    requestInit = init;
    return new Response(JSON.stringify({ messages: [{ id: "wamid.buttons-1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await sendMetaReplyButtonsMessage(
    {
      to: "526440000000",
      body: "¿Tu pedido será para recoger o a domicilio?",
      buttons: [
        { id: "pickup", title: "Para recoger" },
        { id: "delivery", title: "A domicilio" },
      ],
    },
    {
      graphApiVersion: "v25.0",
      phoneNumberId: "phone-test",
      accessToken: "temporary-test-token",
    },
    fetcher
  );

  expect(JSON.parse(String(requestInit?.body))).toMatchObject({
    messaging_product: "whatsapp",
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Tu pedido será para recoger o a domicilio?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "pickup", title: "Para recoger" } },
          { type: "reply", reply: { id: "delivery", title: "A domicilio" } },
        ],
      },
    },
  });
});

test("ofrece botones solo en decisiones breves del pedido", () => {
  const base = createConversation("5216440000000");
  expect(quickRepliesForState({ ...base, stage: "awaiting_fulfillment" }))
    .toEqual([
      { id: "pickup", title: "Para recoger" },
      { id: "delivery", title: "A domicilio" },
    ]);
  expect(quickRepliesForState({ ...base, stage: "awaiting_address_confirmation" }))
    .toHaveLength(3);
  expect(quickRepliesForState({ ...base, stage: "browsing_catalog" })).toEqual([]);
});

test("un error de Meta se reporta sin incluir credenciales ni cuerpo remoto", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({
      error: {
        message: "remote sensitive detail",
        type: "OAuthException",
        code: 190,
        error_subcode: 463,
        is_transient: false,
      },
    }), {
      status: 401,
    });

  const request = sendMetaTextMessage(
    { to: "526440000000", body: "Prueba" },
    {
      graphApiVersion: "v25.0",
      phoneNumberId: "phone-test",
      accessToken: "secret-token",
    },
    fetcher
  );
  await expect(request).rejects.toThrow(
    "Meta rechazó el mensaje con estado 401 (código 190, subcódigo 463, tipo OAuthException, no transitorio)"
  );
  await expect(
    sendMetaTextMessage(
      { to: "526440000000", body: "Prueba" },
      {
        graphApiVersion: "v25.0",
        phoneNumberId: "phone-test",
        accessToken: "secret-token",
      },
      fetcher
    )
  ).rejects.not.toThrow("remote sensitive detail");
});

test("reintenta un rechazo transitorio de Meta antes de declarar el envío fallido", async () => {
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(
        JSON.stringify({ error: { code: 2, is_transient: true } }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ messages: [{ id: "wamid.retried" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const sent = await sendMetaTextMessage(
    { to: "526440000000", body: "Respuesta recuperada" },
    {
      graphApiVersion: "v25.0",
      phoneNumberId: "phone-test",
      accessToken: "test-token",
    },
    fetcher
  );

  expect(sent.messageId).toBe("wamid.retried");
  expect(attempts).toBe(2);
});
