export function serviceFunctionHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}
