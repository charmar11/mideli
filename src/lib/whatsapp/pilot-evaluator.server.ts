import "server-only";

import { loadWhatsappCatalog } from "./catalog.server";
import { readWhatsappServerConfig } from "./config.server";
import { createGeminiSemanticInterpreter } from "./gemini-interpreter.server";
import {
  loadWhatsappOperationsConfig,
  quoteWhatsappDelivery,
} from "./operations.server";
import { mapsProbeAddress, runWhatsappPilotBatch } from "./pilot-evaluator";

export async function runWhatsappPilotBatchOnServer(batchIndex: number) {
  const [catalog, operations] = await Promise.all([
    loadWhatsappCatalog(),
    loadWhatsappOperationsConfig(),
  ]);
  const serverConfig = readWhatsappServerConfig();
  const interpreter = serverConfig.geminiInterpreterEnabled
    ? createGeminiSemanticInterpreter({
        apiKey: serverConfig.geminiApiKey,
        model: serverConfig.geminiModel,
      })
    : null;

  return runWhatsappPilotBatch({
    batchIndex,
    dependencies: {
      catalog,
      interpreter,
      mapsValidAddress: mapsProbeAddress({
        latitude: operations.settings.store_latitude,
        longitude: operations.settings.store_longitude,
        fallbackAddress: operations.settings.store_address,
      }),
      quoteDelivery: (address) =>
        quoteWhatsappDelivery({
          conversationId: null,
          address,
          config: operations,
        }),
    },
  });
}
