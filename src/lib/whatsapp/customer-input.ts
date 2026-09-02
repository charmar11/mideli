import { normalizeText } from "./normalize";

const COMMAND_PREFIXES = [
  "cmd:",
  "cart:",
  "catalog:",
  "category:",
  "product:",
  "modifier:",
  "beverage:",
  "fulfillment:",
  "address:",
  "payment:",
  "confirmation:",
  "edit:",
  "note:",
];

const QUOTED_PROMPT_MARKERS = [
  "que se te antoja",
  "deseas agregar alguna bebida",
  "algo para tomar",
  "tu pedido sera para recoger o a domicilio",
  "usamos tu domicilio anterior",
  "hay alguna referencia que ayude",
  "encontre este domicilio",
  "es aqui responde",
  "pagaras en efectivo o por transferencia",
  "pagaras en efectivo tarjeta o transferencia",
  "confirmas el pedido",
  "donde quieres guardar la indicacion",
  "deseas agregar algo mas",
  "que deseas cambiar",
  "dime el cambio directamente",
  "responde con el numero o el nombre",
  "escribe mas para ver otros",
  "ver productos",
];

const CATALOG_NOISE_MARKERS = [
  "responde con el numero o el nombre",
  "escribe mas para ver otros",
  "mostrar mas opciones",
  "ver productos",
];

// Algunos clientes o proveedores convierten el cuerpo del mensaje interactivo
// y el botón elegido en una sola línea. Estos son títulos que el motor puede
// interpretar sin depender de Gemini ni del formato recibido.
const INLINE_REPLY_TITLES = [
  "Cambiar dirección",
  "Otro domicilio",
  "Usar domicilio",
  "Sin referencia",
  "Sí, es aquí",
  "No, gracias",
  "Agregar más",
  "Añadir nota",
  "Ver bebidas",
  "Volver al pedido",
  "A domicilio",
  "Para recoger",
  "Transferencia",
  "Efectivo",
  "Confirmar",
  "Modificar",
  "Terminar",
  "Hacer pedido",
  "Ver menú",
];

function cleanLine(value: string) {
  return value
    .replace(/^\s*(?:>|\*|-|•)\s*/, "")
    .trim();
}

function isPromptLine(value: string) {
  const text = normalizeText(value);
  return QUOTED_PROMPT_MARKERS.some((marker) => text.includes(marker));
}

function isCatalogPromptLine(value: string) {
  const text = normalizeText(value);
  return CATALOG_NOISE_MARKERS.some((marker) => text.includes(marker));
}

function isCatalogDescription(value: string) {
  const text = normalizeText(value);
  return /^\$?\d+(?:\.\d+)?(?:\s*[·•-].*)?$/.test(text);
}

function isPromptContinuation(value: string) {
  const text = normalizeText(value);
  return (
    !text ||
    text.startsWith("si necesitas agregar una indicacion") ||
    text.startsWith("responde si") ||
    text.startsWith("responde con")
  );
}

function lastInlineReply(raw: string) {
  const normalized = normalizeText(raw);
  const hasKnownPrompt = QUOTED_PROMPT_MARKERS.some((marker) =>
    normalized.includes(marker)
  ) || normalized.includes("bienvenido a mideli");
  if (!hasKnownPrompt) return null;

  const lowerRaw = raw.toLocaleLowerCase("es-MX");
  const candidates = INLINE_REPLY_TITLES.flatMap((title) => {
    const lowerTitle = title.toLocaleLowerCase("es-MX");
    const matches: Array<{ title: string; index: number }> = [];
    let from = 0;
    while (from < lowerRaw.length) {
      const index = lowerRaw.indexOf(lowerTitle, from);
      if (index < 0) break;
      matches.push({ title, index });
      from = index + lowerTitle.length;
    }
    return matches;
  }).filter((candidate) => candidate.index > 0);

  return candidates.sort((left, right) => right.index - left.index)[0]?.title ?? null;
}

/**
 * WhatsApp puede reenviar el texto visible del mensaje interactivo junto con
 * la respuesta escrita por el cliente. Conservamos únicamente la parte nueva
 * cuando reconocemos con certeza uno de nuestros propios prompts.
 */
export function customerReplyText(value: string) {
  const raw = value.trim();
  if (!raw || COMMAND_PREFIXES.some((prefix) => raw.startsWith(prefix))) return raw;

  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
  if (lines.length < 2) return lastInlineReply(raw) ?? raw;

  let lastPrompt = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (isPromptLine(lines[index])) lastPrompt = index;
  }
  if (lastPrompt < 0 || lastPrompt >= lines.length - 1) {
    return lastInlineReply(raw) ?? raw;
  }

  const response = lines
    .slice(lastPrompt + 1)
    .filter((line) => !isPromptContinuation(line));

  // Algunos integradores devuelven el cuerpo visible del cuadro junto con
  // el título elegido. Para un catálogo, el título es la primera línea útil;
  // el precio o la descripción que le sigue no es otra respuesta.
  if (isCatalogPromptLine(lines[lastPrompt])) {
    const selected = response.find(
      (line) => !isCatalogPromptLine(line) && !isCatalogDescription(line)
    );
    return selected?.trim() || raw;
  }

  return response.at(-1)?.trim() || raw;
}
