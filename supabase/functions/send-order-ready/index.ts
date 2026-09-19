import "@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

/**
 * Compatibility endpoint for older clients. The notification worker is the
 * single authority for recipient selection, business boundaries and delivery
 * idempotency. Keeping this adapter avoids a second implementation that could
 * accidentally notify staff from another business.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Servicio no configurado" }, 503);
  }

  const authorization = req.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Sesión no válida" }, 401);
  }

  const { orderId } = (await req.json().catch(() => ({}))) as {
    orderId?: string;
  };
  if (!orderId) {
    return json({ error: "Falta el pedido" }, 400);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-order-notification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId, event: "ready" }),
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
});
