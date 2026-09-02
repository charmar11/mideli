import type { SelectedModifier } from "@/types/database";

type ModifierRecord = Record<string, unknown>;

function textValue(record: ModifierRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberValue(record: ModifierRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

export function normalizeWhatsappPosModifiers(value: unknown): SelectedModifier[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const record = candidate as ModifierRecord;
    const option = textValue(record, "option", "optionName");
    if (!option) return [];

    const modifier: SelectedModifier = {
      group_id: textValue(record, "group_id", "groupId") || undefined,
      option_id: textValue(record, "option_id", "optionId") || undefined,
      group: textValue(record, "group", "groupName"),
      option,
      price: numberValue(record, "price"),
    };
    const description = textValue(record, "description");
    if (description) modifier.description = description;
    return [modifier];
  });
}

export function distanceMetersToKilometers(value: unknown): number | null {
  const distance = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(distance) || distance <= 0) return null;
  return Math.round((distance / 1000) * 10) / 10;
}
