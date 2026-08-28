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

function isPromptContinuation(value: string) {
  const text = normalizeText(value);
  return (
    !text ||
    text.startsWith("si necesitas agregar una indicacion") ||
    text.startsWith("responde si") ||
    text.startsWith("responde con")
  );
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
  if (lines.length < 2) return raw;

  let lastPrompt = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (isPromptLine(lines[index])) lastPrompt = index;
  }
  if (lastPrompt < 0 || lastPrompt >= lines.length - 1) return raw;

  const response = lines
    .slice(lastPrompt + 1)
    .filter((line) => !isPromptContinuation(line));
  return response.at(-1)?.trim() || raw;
}

