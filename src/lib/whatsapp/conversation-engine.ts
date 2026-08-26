import {
  findCatalogProducts,
  matchItemModifiers,
  missingRequiredGroups,
} from "./catalog";
import {
  includesPhrase,
  normalizePhone,
  normalizeText,
  quantityFromText,
} from "./normalize";
import type {
  ConversationCatalog,
  ConversationCartLine,
  ConversationModifier,
  ConversationResult,
  ConversationState,
} from "./types";

function cartTotal(cart: ConversationCartLine[]) {
  return cart.reduce((total, line) => {
    const extras = line.selectedModifiers.reduce(
      (modifierTotal, modifier) => modifierTotal + modifier.price,
      0
    );
    return total + (line.unitPrice + extras) * line.quantity;
  }, 0);
}

function withCart(state: ConversationState, cart: ConversationCartLine[]) {
  return { ...state, cart, total: cartTotal(cart) };
}

function result(
  state: ConversationState,
  reply: string,
  action: ConversationResult["action"] = "none"
): ConversationResult {
  return { state, reply, action };
}

function isDoneIntent(text: string) {
  return ["ya es todo", "eso es todo", "seria todo", "terminar", "listo"].some(
    (phrase) => includesPhrase(text, phrase)
  );
}

function isConfirmation(text: string) {
  return ["si", "si confirmo", "confirmo", "correcto", "adelante"].some(
    (phrase) => text === phrase || includesPhrase(text, phrase)
  );
}

function itemForLine(line: ConversationCartLine, catalog: ConversationCatalog) {
  return catalog.items.find((item) => item.id === line.menuItemId) ?? null;
}

function firstIncompleteLine(
  cart: ConversationCartLine[],
  catalog: ConversationCatalog
) {
  return cart.find((line) => {
    const item = itemForLine(line, catalog);
    return item ? missingRequiredGroups(item, line.selectedModifiers).length > 0 : false;
  });
}

function modifierQuestion(line: ConversationCartLine, catalog: ConversationCatalog) {
  const item = itemForLine(line, catalog);
  const missing = item ? missingRequiredGroups(item, line.selectedModifiers) : [];
  const labels = missing.map((group) => group.name).join(" y ");
  return `Para ${line.name} necesito elegir: ${labels}. ¿Cuál prefieres?`;
}

function mergeModifiers(
  existing: ConversationModifier[],
  additions: ConversationModifier[],
  catalog: ConversationCatalog,
  menuItemId: string
) {
  const item = catalog.items.find((candidate) => candidate.id === menuItemId);
  if (!item) return existing;
  const next = [...existing];

  for (const addition of additions) {
    const group = item.modifiers.find(
      (candidate, groupIndex) =>
        (candidate.id ?? `group-${groupIndex}`) === addition.groupId
    );
    if ((group?.selection_mode ?? "single") === "single") {
      const withoutGroup = next.filter(
        (modifier) => modifier.groupId !== addition.groupId
      );
      next.splice(0, next.length, ...withoutGroup, addition);
    } else if (!next.some((modifier) => modifier.optionId === addition.optionId)) {
      next.push(addition);
    }
  }
  return next;
}

function cartSummary(state: ConversationState) {
  const lines = state.cart
    .map((line) => `${line.quantity}x ${line.name}`)
    .join(", ");
  const delivery = state.serviceType === "domicilio" ? ` Domicilio: ${state.address}.` : " Para recoger.";
  const payment = state.payment ? ` Pago: ${state.payment.method}.` : "";
  return `${lines}. Total $${state.total}.${delivery}${payment} ¿Confirmas el pedido?`;
}

export function createConversation(phone: string): ConversationState {
  return {
    phone: normalizePhone(phone),
    stage: "ordering",
    cart: [],
    total: 0,
    pendingLineId: null,
    serviceType: null,
    address: null,
    payment: null,
    ambiguityCount: 0,
    nextLineNumber: 1,
  };
}

function handlePendingModifiers(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
) {
  const line = state.cart.find((item) => item.id === state.pendingLineId);
  const catalogItem = line ? itemForLine(line, catalog) : null;
  if (!line || !catalogItem) {
    return result({ ...state, stage: "ordering", pendingLineId: null }, "¿Qué más deseas agregar?");
  }

  const additions = matchItemModifiers(catalogItem, message);
  const selectedModifiers = mergeModifiers(
    line.selectedModifiers,
    additions,
    catalog,
    line.menuItemId
  );
  const cart = state.cart.map((item) =>
    item.id === line.id ? { ...item, selectedModifiers } : item
  );
  const nextState = withCart(state, cart);
  const updatedLine = cart.find((item) => item.id === line.id)!;

  if (missingRequiredGroups(catalogItem, selectedModifiers).length > 0) {
    return result(nextState, modifierQuestion(updatedLine, catalog));
  }

  const incomplete = firstIncompleteLine(cart, catalog);
  if (incomplete) {
    return result(
      { ...nextState, pendingLineId: incomplete.id },
      modifierQuestion(incomplete, catalog)
    );
  }

  return result(
    { ...nextState, stage: "ordering", pendingLineId: null, ambiguityCount: 0 },
    `Listo, agregué las opciones de ${line.name}. Tu total es $${nextState.total}. ¿Deseas algo más?`
  );
}

function handleOrdering(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
) {
  const text = normalizeText(message);
  if (isDoneIntent(text)) {
    if (state.cart.length === 0) {
      return result(state, "Tu pedido está vacío. Dime qué platillo deseas agregar.");
    }
    return result(
      { ...state, stage: "awaiting_fulfillment", ambiguityCount: 0 },
      "¿Tu pedido es para recoger o a domicilio?"
    );
  }

  const matches = findCatalogProducts(message, catalog);
  const matchedItemIds = new Set(matches.map((match) => match.item.id));
  const isRemoval = /^(quita|quitar|elimina|eliminar|borra|borrar)\b/.test(text);
  if (isRemoval && matches.length > 0) {
    const cart = state.cart.filter((line) => !matchedItemIds.has(line.menuItemId));
    if (cart.length === state.cart.length) {
      return result(state, "Ese producto no está en tu pedido actual.");
    }
    const nextState = withCart({ ...state, ambiguityCount: 0 }, cart);
    return result(nextState, `Quité el producto. Tu total ahora es $${nextState.total}.`);
  }

  const isQuantityChange = /^(cambia|cambiar|deja|ajusta)\b/.test(text);
  if (isQuantityChange && matches.length > 0) {
    const quantity = quantityFromText(text);
    const menuItemId = matches[0].item.id;
    const existingLine = state.cart.find((line) => line.menuItemId === menuItemId);
    if (!existingLine) {
      return result(state, "Ese producto no está en tu pedido actual.");
    }
    const cart = state.cart.map((line) =>
      line.id === existingLine.id ? { ...line, quantity } : line
    );
    const nextState = withCart({ ...state, ambiguityCount: 0 }, cart);
    return result(
      nextState,
      `Actualicé ${existingLine.name} a ${quantity}. Tu total es $${nextState.total}.`
    );
  }

  if (matches.length === 0) {
    const ambiguityCount = state.ambiguityCount + 1;
    if (ambiguityCount >= 2) {
      return result(
        { ...state, stage: "handoff", ambiguityCount },
        "No quiero hacerte perder tiempo. Una persona del equipo continuará contigo.",
        "handoff"
      );
    }
    return result(
      { ...state, ambiguityCount },
      "No encontré ese producto en el menú actual. Puedes escribir el nombre de otro platillo."
    );
  }

  let nextLineNumber = state.nextLineNumber;
  const additions = matches.map((match) => {
    const selectedModifiers = matchItemModifiers(match.item, match.segment);
    const line: ConversationCartLine = {
      id: `line-${nextLineNumber}`,
      menuItemId: match.item.id,
      name: match.item.name,
      quantity: match.quantity,
      unitPrice: match.item.price,
      selectedModifiers,
      notes: "",
    };
    nextLineNumber += 1;
    return line;
  });
  const nextState = withCart(state, [...state.cart, ...additions]);
  const incomplete = firstIncompleteLine(nextState.cart, catalog);

  if (incomplete) {
    return result(
      {
        ...nextState,
        stage: "awaiting_modifiers",
        pendingLineId: incomplete.id,
        ambiguityCount: 0,
        nextLineNumber,
      },
      modifierQuestion(incomplete, catalog)
    );
  }

  return result(
    {
      ...nextState,
      ambiguityCount: 0,
      nextLineNumber,
    },
    `Agregué ${additions.map((line) => `${line.quantity}x ${line.name}`).join(", ")}. Tu total es $${nextState.total}. ¿Deseas algo más?`
  );
}

function handleFulfillment(state: ConversationState, message: string) {
  const text = normalizeText(message);
  if (["domicilio", "entrega", "envio"].some((word) => includesPhrase(text, word))) {
    return result(
      { ...state, serviceType: "domicilio", stage: "awaiting_address" },
      "Escribe la dirección de entrega y una referencia breve. También puedes compartir tu ubicación."
    );
  }
  if (["recoger", "para llevar", "paso por"].some((phrase) => includesPhrase(text, phrase))) {
    return result(
      { ...state, serviceType: "para_llevar", stage: "awaiting_payment" },
      "¿Pagarás en efectivo, con tarjeta o por transferencia?"
    );
  }
  return result(state, "Indícame si es para recoger o a domicilio.");
}

function handleAddress(state: ConversationState, message: string) {
  if (normalizeText(message).length < 8) {
    return result(state, "Necesito una dirección un poco más completa para evitar retrasos.");
  }
  return result(
    { ...state, address: message.trim(), stage: "awaiting_payment" },
    "¿Pagarás en efectivo, con tarjeta o por transferencia?"
  );
}

function handlePayment(state: ConversationState, message: string) {
  const text = normalizeText(message);
  let method: ConversationState["payment"] extends infer Payment
    ? Payment extends { method: infer Method }
      ? Method
      : never
    : never;
  if (includesPhrase(text, "efectivo")) method = "efectivo";
  else if (includesPhrase(text, "tarjeta")) method = "tarjeta";
  else if (includesPhrase(text, "transferencia") || includesPhrase(text, "transfer")) {
    method = "transferencia";
  } else {
    return result(state, "Elige efectivo, tarjeta o transferencia.");
  }

  const amountMatch = method === "efectivo" ? text.match(/(?:con|de)\s+(\d+)/) : null;
  const cashTendered = amountMatch ? Number(amountMatch[1]) : null;
  if (cashTendered !== null && cashTendered < state.total) {
    return result(state, `El total es $${state.total}. Indícame con cuánto pagarás.`);
  }

  const nextState: ConversationState = {
    ...state,
    payment: { method, cashTendered },
    stage: "awaiting_confirmation",
  };
  return result(nextState, cartSummary(nextState));
}

function handleConfirmation(state: ConversationState, message: string) {
  const text = normalizeText(message);
  if (isConfirmation(text)) {
    return result(
      { ...state, stage: "confirmed" },
      "Pedido confirmado. Estoy registrándolo con el equipo.",
      "request_order_creation"
    );
  }
  if (includesPhrase(text, "modificar") || includesPhrase(text, "cambiar")) {
    return result(
      { ...state, stage: "ordering" },
      "Claro. Dime qué deseas agregar o cambiar."
    );
  }
  if (includesPhrase(text, "cancelar")) {
    return result({ ...state, stage: "cancelled" }, "El pedido fue cancelado.");
  }
  return result(state, "Escribe confirmar para enviar el pedido o modificar para hacer cambios.");
}

export function handleConversationMessage(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult {
  if (state.stage === "awaiting_modifiers") {
    return handlePendingModifiers(state, message, catalog);
  }
  if (state.stage === "ordering") return handleOrdering(state, message, catalog);
  if (state.stage === "awaiting_fulfillment") return handleFulfillment(state, message);
  if (state.stage === "awaiting_address") return handleAddress(state, message);
  if (state.stage === "awaiting_payment") return handlePayment(state, message);
  if (state.stage === "awaiting_confirmation") return handleConfirmation(state, message);
  if (state.stage === "handoff") {
    return result(state, "Una persona del equipo continuará contigo en cuanto esté disponible.", "handoff");
  }
  if (state.stage === "confirmed") {
    return result(state, "Tu pedido ya fue confirmado.");
  }
  return result(state, "Este pedido fue cancelado. Escribe hola para comenzar otro.");
}
