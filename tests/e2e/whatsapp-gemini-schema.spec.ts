import { expect, test } from "@playwright/test";
import { geminiResponseSchema } from "@/lib/whatsapp/gemini-schema";

const supportedKeywords = new Set([
  "type",
  "additionalProperties",
  "required",
  "properties",
  "minimum",
  "maximum",
  "items",
  "maxItems",
  "enum",
]);

function unsupportedKeywords(value: unknown, path = "schema"): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const failures: string[] = [];
  for (const [key, child] of Object.entries(record)) {
    if (path.endsWith(".properties")) {
      failures.push(...unsupportedKeywords(child, `${path}.${key}`));
      continue;
    }
    if (!supportedKeywords.has(key)) failures.push(`${path}.${key}`);
    if (key === "properties") {
      failures.push(...unsupportedKeywords(child, `${path}.properties`));
    } else if (key === "items") {
      failures.push(...unsupportedKeywords(child, `${path}.items`));
    }
  }
  return failures;
}

test("el esquema de Gemini usa únicamente palabras clave admitidas por la API", () => {
  const schema = geminiResponseSchema();

  expect(unsupportedKeywords(schema)).toEqual([]);
  expect(JSON.stringify(schema)).not.toContain("maxLength");
  expect(schema.required).toEqual(["confidence", "actions"]);
});
