const QUANTITY_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAddressForComparison(value: string) {
  return normalizeText(value)
    .replace(/\b(?:calle|c)\b/g, "")
    .replace(/\b(?:avenida|av)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhoneForDisplay(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return "Sin teléfono";
  if (/^(?:52|521)\d{10}$/.test(digits)) {
    const local = digits.slice(-10);
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return digits.length === 10
    ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    : `+${digits}`;
}

export function formatPhoneForCopy(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  if (/^(?:52|521)\d{10}$/.test(digits)) return digits.slice(-10);
  return digits;
}

export function phoneAliases(value: string) {
  const phone = normalizePhone(value);
  if (!phone) return [];
  if (/^52\d{10}$/.test(phone)) return [phone, `521${phone.slice(2)}`];
  if (/^521\d{10}$/.test(phone)) return [phone, `52${phone.slice(3)}`];
  return [phone];
}

export function quantityFromText(value: string) {
  return explicitQuantityFromText(value) ?? 1;
}

export function explicitQuantityFromText(value: string) {
  const normalized = normalizeText(value);
  const tokens = normalized.split(" ").filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (/^\d+$/.test(token)) return Math.max(1, Number(token));
    if (QUANTITY_WORDS[token]) return QUANTITY_WORDS[token];
  }
  return null;
}

export function includesPhrase(text: string, phrase: string) {
  if (!phrase) return false;
  return (` ${text} `).includes(` ${phrase} `);
}
