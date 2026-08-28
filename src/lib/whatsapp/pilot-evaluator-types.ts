export type WhatsappPilotDependency = "local" | "gemini" | "maps";
export type WhatsappPilotScenarioStatus = "passed" | "review" | "failed";

export type WhatsappPilotScenarioResult = {
  id: string;
  title: string;
  family: string;
  dependency: WhatsappPilotDependency;
  status: WhatsappPilotScenarioStatus;
  critical: boolean;
  durationMs: number;
  detail: string;
};

export type WhatsappPilotBatchResult = {
  batchIndex: number;
  totalBatches: number;
  totalScenarios: number;
  results: WhatsappPilotScenarioResult[];
};

