import { expect, test } from "@playwright/test";
import { answerBusinessQuestion } from "@/lib/whatsapp/business-answers";

const config = {
  timezone: "America/Hermosillo",
  storeAddress: "Calle Yaqui 404 Oriente",
  hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    opensAt: "12:00:00",
    closesAt: "23:00:00",
  })),
};

test("responde horario, pagos, cobertura y ubicación sin usar IA", () => {
  expect(answerBusinessQuestion("¿Cuál es su horario?", config)).toContain("12:00 p. m.");
  expect(answerBusinessQuestion("¿Qué pagos aceptan?", config)).toContain("transferencia");
  expect(answerBusinessQuestion("¿Hasta dónde hacen envíos?", config)).toContain("cobertura");
  expect(answerBusinessQuestion("¿Dónde están?", config)).toContain("Yaqui 404");
});

test("no confunde una elección de pago con una pregunta", () => {
  expect(answerBusinessQuestion("En efectivo", config)).toBeNull();
});
