import { expect, test } from "@playwright/test";
import { customerReplyText } from "@/lib/whatsapp/customer-input";

test.describe("normalización segura de respuestas de WhatsApp", () => {
  const cases = [
    {
      input: "🥤 ¿Algo para tomar?\n\n¿Deseas agregar alguna bebida a tu pedido?\nNo, gracias",
      expected: "No, gracias",
    },
    {
      input: "📍 ¿Tu pedido será para recoger o a domicilio?\nA domicilio",
      expected: "A domicilio",
    },
    {
      input: "¿Usamos tu domicilio anterior: Calle Uno 123? Responde sí o escribe otro domicilio.\nOtro domicilio",
      expected: "Otro domicilio",
    },
    {
      input: "🧾 Resumen de tu pedido\nTotal: $300\n¿Confirmas el pedido?\nSi necesitas agregar una indicación, puedes escribirla antes de confirmar.\nConfirmar",
      expected: "Confirmar",
    },
    {
      input: "Claro 😊 Dime el cambio directamente. Por ejemplo: agrega bebida.\nModificar",
      expected: "Modificar",
    },
  ];

  for (const entry of cases) {
    test(`extrae únicamente la respuesta nueva: ${entry.expected}`, () => {
      expect(customerReplyText(entry.input)).toBe(entry.expected);
    });
  }

  test("conserva direcciones y notas multilínea que no citan un prompt", () => {
    expect(customerReplyText("Calle Sinagogas 1230\nColonia San Xavier\nCasa blanca")).toBe(
      "Calle Sinagogas 1230\nColonia San Xavier\nCasa blanca"
    );
  });

  test("conserva comandos interactivos sin modificarlos", () => {
    expect(customerReplyText("confirmation:confirm")).toBe("confirmation:confirm");
  });

  test("extrae un producto cuando llega pegado al catálogo visible", () => {
    expect(
      customerReplyText(
        "🍔 Hamburguesas\n\n1. Hamburguesa Sencilla · $135\n\nResponde con el número o el nombre.\nHamburguesa Sencilla\n$135 · Incluye papas."
      )
    ).toBe("Hamburguesa Sencilla");
  });

  test("extrae un botón cuando el cuerpo interactivo llega en una sola línea", () => {
    expect(
      customerReplyText(
        "¡Hola! 👋 Bienvenido a Mideli. ¿Qué se te antoja hoy? 😊 - Hacer pedido - Ver menú Ver menú"
      )
    ).toBe("Ver menú");
  });

  test("extrae una decisión de pago pegada al texto de la pregunta", () => {
    expect(
      customerReplyText("¿Pagarás en efectivo o por transferencia? Efectivo")
    ).toBe("Efectivo");
  });
});
