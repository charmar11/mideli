export function canCreateWhatsappOrder(input: {
  serverEnabled: boolean;
  operationsEnabled: boolean;
}) {
  return input.serverEnabled && input.operationsEnabled;
}
