const POS_CREATION_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PosOrderRecoveryStatus = "found" | "not_found" | "unavailable";

export function isPosCreationKey(value: unknown): value is string {
  return typeof value === "string" && POS_CREATION_KEY_PATTERN.test(value);
}

/** Only a complete, authorized set of orders can resolve a pending attempt. */
export function classifyPosOrderRecovery(
  expectedBusinessIds: readonly string[],
  actualBusinessIds: readonly string[] | null,
  lookupFailed = false,
): PosOrderRecoveryStatus {
  if (lookupFailed) return "unavailable";
  if (actualBusinessIds === null) return "not_found";

  const expected = new Set(expectedBusinessIds);
  const actual = new Set(actualBusinessIds);
  if (
    expected.size === 0 ||
    actual.size !== actualBusinessIds.length ||
    actual.size !== expected.size ||
    [...expected].some((businessId) => !actual.has(businessId))
  ) {
    return "unavailable";
  }

  return "found";
}
