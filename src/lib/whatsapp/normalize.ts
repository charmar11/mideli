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

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function quantityFromText(value: string) {
  const normalized = normalizeText(value);
  const tokens = normalized.split(" ").filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (/^\d+$/.test(token)) return Math.max(1, Number(token));
    if (QUANTITY_WORDS[token]) return QUANTITY_WORDS[token];
  }
  return 1;
}

export function includesPhrase(text: string, phrase: string) {
  if (!phrase) return false;
  return (` ${text} `).includes(` ${phrase} `);
}
