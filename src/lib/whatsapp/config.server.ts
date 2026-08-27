import "server-only";

import { phoneAliases } from "./normalize";

function enabled(value: string | undefined) {
  return value === "true";
}

export function readWhatsappServerConfig() {
  const provider = process.env.WHATSAPP_PROVIDER === "meta" ? "meta" : "simulator";
  const geminiApiKey = process.env.GEMINI_API_KEY || "";
  const allowedPhones = new Set(
    (process.env.WHATSAPP_TEST_ALLOWLIST ?? "")
      .split(",")
      .flatMap(phoneAliases)
      .filter(Boolean)
  );

  return {
    ordersEnabled: enabled(process.env.WHATSAPP_ORDERS_ENABLED),
    orderCreationEnabled: enabled(process.env.WHATSAPP_ORDER_CREATION_ENABLED),
    provider,
    dryRun: process.env.WHATSAPP_DRY_RUN !== "false",
    allowedPhones,
    graphApiVersion: process.env.META_GRAPH_API_VERSION || "v25.0",
    accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || "",
    wabaId: process.env.META_WHATSAPP_WABA_ID || "",
    verifyToken: process.env.META_WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.META_APP_SECRET || "",
    geminiInterpreterEnabled:
      process.env.WHATSAPP_GEMINI_INTERPRETER_ENABLED !== "false" && Boolean(geminiApiKey),
    geminiApiKey,
    geminiModel: process.env.WHATSAPP_GEMINI_MODEL || "gemini-2.5-flash-lite",
  } as const;
}
