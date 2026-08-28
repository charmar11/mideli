import { normalizeText } from "./normalize";

type BusinessAnswerConfig = {
  timezone: string;
  storeAddress: string;
  hours: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    opensAt: string;
    closesAt: string;
  }>;
};

const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function shortTime(value: string) {
  const [hour = "0", minute = "00"] = value.split(":");
  const numeric = Number(hour);
  const suffix = numeric >= 12 ? "p. m." : "a. m.";
  const display = numeric % 12 || 12;
  return `${display}:${minute} ${suffix}`;
}

export function answerBusinessQuestion(
  message: string,
  config: BusinessAnswerConfig
) {
  const text = normalizeText(message);
  const asksQuestion = /\b(que|cual|cuales|cuando|donde|hasta|aceptan|manejan|tienen|abren|cierran|horario|ubicacion)\b/.test(text);
  if (!asksQuestion) return null;

  if (/\b(horario|abren|cierran|a que hora)\b/.test(text)) {
    const lines = config.hours
      .slice()
      .sort((left, right) => left.dayOfWeek - right.dayOfWeek)
      .map((rule) => rule.isOpen
        ? `${DAY_NAMES[rule.dayOfWeek]}: ${shortTime(rule.opensAt)} a ${shortTime(rule.closesAt)}`
        : `${DAY_NAMES[rule.dayOfWeek]}: cerrado`
      );
    return `🕐 *Horario de Mideli*\n${lines.join("\n")}`;
  }

  if (/\b(pago|pagos|efectivo|tarjeta|transferencia)\b/.test(text)) {
    return "💳 Para recoger aceptamos efectivo, tarjeta o transferencia. A domicilio aceptamos efectivo o transferencia.";
  }

  if (/\b(reparto|domicilio|envio|cobertura|hasta donde)\b/.test(text)) {
    return "🛵 Hacemos entregas dentro de nuestra cobertura. El costo se calcula con la ubicación exacta antes de confirmar tu pedido.";
  }

  if (/\b(donde estan|direccion del local|ubicacion del local)\b/.test(text)) {
    return config.storeAddress
      ? `📍 Estamos en ${config.storeAddress}.`
      : "📍 Puedo ayudarte con un pedido para recoger o calcular la entrega a tu domicilio.";
  }

  return null;
}

