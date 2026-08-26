import {
  findCatalogProducts,
  matchItemModifiers,
  missingRequiredGroups,
} from "./catalog";
import {
  explicitQuantityFromText,
  includesPhrase,
  normalizePhone,
  normalizeText,
  quantityFromText,
} from "./normalize";
import type {
  ConversationCatalog,
  ConversationCatalogItem,
  ConversationCartReconciliation,
  ConversationCartLine,
  ConversationDeliveryQuote,
  ConversationModifier,
  ConversationResult,
  ConversationServiceType,
  ConversationState,
} from "./types";

const DEFAULT_PAGE_SIZE = 5;

const CATEGORY_EMOJIS = [
  { terms: ["hamburguesa", "burger"], emoji: "🍔" },
  { terms: ["sushi", "roll"], emoji: "🍣" },
  { terms: ["boneless", "alita"], emoji: "🍗" },
  { terms: ["papa", "compartir"], emoji: "🍟" },
  { terms: ["bowl"], emoji: "🥗" },
  { terms: ["bebida", "refresco", "limonada", "agua"], emoji: "🥤" },
  { terms: ["cerveza", "cheve", "caguama"], emoji: "🍺" },
] as const;

function categoryEmoji(name: string) {
  const text = normalizeText(name);
  return CATEGORY_EMOJIS.find((entry) =>
    entry.terms.some((term) => includesPhrase(text, term) || text.includes(term))
  )?.emoji ?? "🍽️";
}

function serviceTypeFromText(text: string): ConversationServiceType | null {
  if (["domicilio", "entrega", "envio"].some((word) => includesPhrase(text, word))) {
    return "domicilio";
  }
  if (["recoger", "para llevar", "paso por"].some((phrase) => includesPhrase(text, phrase))) {
    return "para_llevar";
  }
  return null;
}

function withServiceType(
  state: ConversationState,
  serviceType: ConversationServiceType
) {
  if (serviceType === "domicilio") {
    return {
      ...state,
      serviceType,
      deliveryQuote: null,
      total: itemsSubtotal(state.cart),
    };
  }
  return {
    ...state,
    serviceType,
    address: null,
    addressReference: "",
    deliveryQuote: null,
    total: itemsSubtotal(state.cart),
  };
}

function rememberServiceType(
  conversationResult: ConversationResult,
  serviceType: ConversationServiceType | null
) {
  if (!serviceType) return conversationResult;
  const label = serviceType === "domicilio" ? "a domicilio" : "para recoger";
  return {
    ...conversationResult,
    state: withServiceType(conversationResult.state, serviceType),
    reply: `${conversationResult.reply}\n\n📍 Anotado: será *${label}*.`,
  };
}

function categoryAliases(name: string) {
  const text = normalizeText(name);
  const aliases = new Set([text]);
  for (const word of text.split(" ")) {
    if (word.length < 4 || word === "para") continue;
    aliases.add(word);
    if (word.endsWith("s") && !word.endsWith("ss")) aliases.add(word.slice(0, -1));
  }
  if (text.includes("sushi")) aliases.add("sushi");
  if (text.includes("hamburgues")) aliases.add("hamburguesa");
  if (text.includes("boneless")) aliases.add("boneless");
  return [...aliases].filter(Boolean);
}

function itemsSubtotal(cart: ConversationCartLine[]) {
  return cart.reduce((total, line) => {
    const extras = line.selectedModifiers.reduce(
      (modifierTotal, modifier) => modifierTotal + modifier.price,
      0
    );
    return total + (line.unitPrice + extras) * line.quantity;
  }, 0);
}

function orderTotal(
  cart: ConversationCartLine[],
  quote: ConversationDeliveryQuote | null
) {
  return itemsSubtotal(cart) + (quote?.totalFee ?? 0);
}

function groupedCartLines(cart: ConversationCartLine[]) {
  const grouped = new Map<string, ConversationCartLine>();
  for (const line of cart) {
    const modifierKey = line.selectedModifiers
      .map((modifier) => `${modifier.groupId}:${modifier.optionId}`)
      .sort()
      .join("|");
    const key = [line.menuItemId, line.unitPrice, modifierKey, line.notes].join("::");
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      grouped.set(key, { ...line, selectedModifiers: [...line.selectedModifiers] });
    }
  }
  return [...grouped.values()];
}

function lineDescription(line: ConversationCartLine) {
  const options = line.selectedModifiers.map((modifier) => modifier.optionName);
  const configuration = options.length === 0
    ? ""
    : options.length === 1
      ? ` de ${options[0]}`
      : ` (${options.join(", ")})`;
  return `${line.quantity} ${line.name}${configuration}`;
}

function cartBreakdown(cart: ConversationCartLine[]) {
  return groupedCartLines(cart)
    .map((line) => `• ${lineDescription(line)}`)
    .join("\n");
}

function cartUpdatedReply(state: ConversationState, intro = "✨ *Pedido actualizado*") {
  const service = state.serviceType === "domicilio"
    ? "\n📍 A domicilio"
    : state.serviceType === "para_llevar"
      ? "\n🛍️ Para recoger"
      : "";
  return `${intro}\n\n${cartBreakdown(state.cart)}\n\n🧾 Total actual: *$${state.total}*${service}\n\n¿Así está bien? 😊`;
}

export function withCart(state: ConversationState, cart: ConversationCartLine[]) {
  return {
    ...state,
    cart,
    total: orderTotal(cart, state.deliveryQuote),
  };
}

export function reconcileCartWithCatalog(
  state: ConversationState,
  catalog: ConversationCatalog
): ConversationCartReconciliation {
  const availableIds = new Set(catalog.items.map((item) => item.id));
  const removed = state.cart.filter((line) => !availableIds.has(line.menuItemId));
  if (removed.length === 0) return { state, removed, alternatives: [] };

  const removedCategories = new Set(
    removed.map((line) => line.categoryId).filter((id): id is string => Boolean(id))
  );
  const sameCategory = catalog.items.filter(
    (item) => removedCategories.has(item.categoryId) && !item.isAlcoholic
  );
  const fallback = catalog.items.filter(
    (item) => !item.isBeverage && !item.isAlcoholic
  );
  const alternatives = (sameCategory.length > 0 ? sameCategory : fallback).slice(0, 3);
  const nextState = withCart(
    {
      ...state,
      stage: "ordering",
      payment: null,
      pendingLineId: null,
    },
    state.cart.filter((line) => availableIds.has(line.menuItemId))
  );

  return { state: nextState, removed, alternatives };
}

export function unsupportedMessageHandoff(
  state: ConversationState
): ConversationResult {
  return result(
    { ...state, stage: "handoff" },
    "Recibí un archivo que necesito revisar personalmente. Una persona del equipo continuará contigo.",
    "handoff"
  );
}

export function withDeliveryQuote(
  state: ConversationState,
  deliveryQuote: ConversationDeliveryQuote
): ConversationState {
  return {
    ...state,
    address: deliveryQuote.formattedAddress || state.address,
    deliveryQuote,
    deliveryQuoteAttempts: 0,
    total: orderTotal(state.cart, deliveryQuote),
    stage: "awaiting_payment",
  };
}

export function recoverDeliveryQuote(
  state: ConversationState,
  reason: string
): ConversationResult {
  const attempts = state.deliveryQuoteAttempts + 1;
  if (reason === "outside_coverage" || reason === "rate_not_found") {
    return result(
      { ...state, stage: "handoff", deliveryQuoteAttempts: attempts },
      "📍 Ese domicilio necesita una revisión especial de cobertura. Ya lo pasé al equipo para ayudarte con la mejor opción 😊",
      "handoff"
    );
  }
  if (
    reason === "delivery_quotes_disabled" ||
    reason === "store_origin_not_configured" ||
    reason === "google_maps_not_configured"
  ) {
    return result(
      { ...state, stage: "handoff", deliveryQuoteAttempts: attempts },
      "📍 El equipo confirmará personalmente el costo de entrega para este domicilio. Ya les dejé todos tus datos 😊",
      "handoff"
    );
  }
  if (attempts >= 2) {
    return result(
      { ...state, stage: "handoff", deliveryQuoteAttempts: attempts },
      "No quiero hacerte perder tiempo 😊 Ya compartí tu dirección con el equipo para que continúe contigo.",
      "handoff"
    );
  }
  return result(
    {
      ...state,
      stage: "awaiting_address",
      address: null,
      addressReference: "",
      deliveryQuote: null,
      deliveryQuoteAttempts: attempts,
    },
    "📍 No pude ubicar esa dirección con suficiente precisión. Envíamela con calle, número y colonia, o comparte tu ubicación desde WhatsApp 😊"
  );
}

function result(
  state: ConversationState,
  reply: string,
  action: ConversationResult["action"] = "none"
): ConversationResult {
  return { state, reply, action };
}

function isDoneIntent(text: string) {
  return ["ya es todo", "eso es todo", "seria todo", "terminar", "listo", "nada mas"].some(
    (phrase) => text === phrase || includesPhrase(text, phrase)
  );
}

function isConfirmation(text: string) {
  return ["si", "si confirmo", "confirmo", "correcto", "adelante"].some(
    (phrase) => text === phrase || includesPhrase(text, phrase)
  );
}

function isNegative(text: string) {
  return ["no", "no gracias", "ninguna", "sin bebida"].includes(text);
}

function requestsHuman(text: string) {
  return ["humano", "asesor", "persona", "hablar con alguien", "atencion humana"].some(
    (phrase) => includesPhrase(text, phrase)
  );
}

function confirmsArrival(text: string) {
  return ["ya llego", "ya me llego", "ya llego el pedido", "recibi el pedido", "gracias ya llego"].some(
    (phrase) => includesPhrase(text, phrase)
  );
}

function requestsNewOrder(text: string) {
  return ["hola", "nuevo pedido", "otra orden", "quiero pedir de nuevo"].some(
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
  const group = item
    ? missingRequiredGroups(item, line.selectedModifiers)[0]
    : null;
  if (!group) return `¿Qué opción deseas para ${line.name}?`;
  const options = group.options
    .map((option, index) => {
      const extra = Number(option.price) > 0 ? ` +$${Number(option.price)}` : "";
      const detail = option.description ? `: ${option.description}` : "";
      return `${index + 1}. ${option.name}${extra}${detail}`;
    })
    .join("\n");
  const multiple = group.selection_mode === "multiple" ? " Puedes elegir varias." : "";
  return `${categoryEmoji(item?.categoryName ?? "")} *Vamos a personalizar tu ${line.name}*\n\nElige *${group.name}*.${multiple}\n\n${options}`;
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

type CatalogModifierGroup = ConversationCatalogItem["modifiers"][number];

function phraseIndex(text: string, phrase: string) {
  const wrapped = ` ${text} `;
  const index = wrapped.indexOf(` ${phrase} `);
  return index < 0 ? -1 : Math.max(0, index - 1);
}

function modifierFromOption(
  group: CatalogModifierGroup,
  groupIndex: number,
  option: CatalogModifierGroup["options"][number],
  optionIndex: number
): ConversationModifier {
  return {
    groupId: group.id ?? `group-${groupIndex}`,
    groupName: group.name,
    optionId: option.id ?? `option-${groupIndex}-${optionIndex}`,
    optionName: option.name,
    price: Number(option.price),
  };
}

function distributePendingModifiers(
  state: ConversationState,
  line: ConversationCartLine,
  catalogItem: ConversationCatalogItem,
  message: string,
  catalog: ConversationCatalog
) {
  const missing = missingRequiredGroups(catalogItem, line.selectedModifiers)[0];
  if (!missing || (missing.selection_mode ?? "single") !== "single") return null;
  const groupIndex = catalogItem.modifiers.indexOf(missing);
  const groupId = missing.id ?? `group-${groupIndex}`;
  const text = normalizeText(message);
  const matches = missing.options
    .map((option, optionIndex) => ({
      option,
      optionIndex,
      normalizedName: normalizeText(option.name),
      index: phraseIndex(text, normalizeText(option.name)),
    }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);
  if (matches.length === 0) return null;

  const eligible = state.cart.filter((candidate) => {
    if (candidate.menuItemId !== line.menuItemId) return false;
    const item = itemForLine(candidate, catalog);
    return Boolean(
      item && missingRequiredGroups(item, candidate.selectedModifiers).some((group) =>
        (group.id ?? `group-${item.modifiers.indexOf(group)}`) === groupId
      )
    );
  });
  if (eligible.length < 2) return null;

  if (
    matches.length === 1 &&
    /\b(ambos|ambas|todas|todos)\b/.test(text)
  ) {
    const match = matches[0];
    const modifier = modifierFromOption(
      missing,
      groupIndex,
      match.option,
      match.optionIndex
    );
    return state.cart.map((candidate) =>
      eligible.some((target) => target.id === candidate.id)
        ? {
            ...candidate,
            selectedModifiers: mergeModifiers(
              candidate.selectedModifiers,
              [modifier],
              catalog,
              candidate.menuItemId
            ),
          }
        : candidate
    );
  }

  if (matches.length < 2) return null;

  let cursor = 0;
  let remaining = eligible.length;
  let previousEnd = 0;
  const assignments: Array<{ modifier: ConversationModifier; quantity: number }> = [];

  for (const [matchIndex, match] of matches.entries()) {
    const context = text.slice(previousEnd, match.index);
    const remainingIntent = /\b(otro|otros|otra|otras|restante|restantes)\b/.test(context);
    const allIntent = /\b(ambos|todas|todos)\b/.test(context);
    const explicit = explicitQuantityFromText(context);
    const quantity = remainingIntent || allIntent
      ? remaining
      : Math.min(remaining, explicit ?? (matchIndex === matches.length - 1 ? remaining : 1));
    if (quantity > 0) {
      assignments.push({
        modifier: modifierFromOption(missing, groupIndex, match.option, match.optionIndex),
        quantity,
      });
      remaining -= quantity;
    }
    previousEnd = match.index + match.normalizedName.length;
  }

  if (assignments.length < 2 || remaining > 0) return null;
  const updated = new Map<string, ConversationModifier>();
  for (const assignment of assignments) {
    for (let count = 0; count < assignment.quantity; count += 1) {
      const target = eligible[cursor];
      if (!target) break;
      updated.set(target.id, assignment.modifier);
      cursor += 1;
    }
  }
  if (updated.size !== eligible.length) return null;

  return state.cart.map((candidate) => {
    const modifier = updated.get(candidate.id);
    return modifier
      ? {
          ...candidate,
          selectedModifiers: mergeModifiers(
            candidate.selectedModifiers,
            [modifier],
            catalog,
            candidate.menuItemId
          ),
        }
      : candidate;
  });
}

function finishModifierSelection(
  state: ConversationState,
  cart: ConversationCartLine[],
  line: ConversationCartLine,
  catalog: ConversationCatalog
) {
  const nextState = withCart(state, cart);
  const incomplete = firstIncompleteLine(cart, catalog);
  if (incomplete) {
    return result(
      { ...nextState, pendingLineId: incomplete.id },
      modifierQuestion(incomplete, catalog)
    );
  }

  if (nextState.pendingBrowseCategoryId) {
    const browsingState: ConversationState = {
      ...nextState,
      stage: "browsing_catalog",
      pendingLineId: null,
      selectedCategoryId: nextState.pendingBrowseCategoryId,
      pendingBrowseCategoryId: null,
      catalogPage: 0,
      ambiguityCount: 0,
    };
    return result(
      browsingState,
      `${cartUpdatedReply(browsingState, "✅ *Opciones guardadas*")}\n\n${productMessage(browsingState, catalog)}`
    );
  }

  const completedState: ConversationState = {
    ...nextState,
    stage: "ordering",
    pendingLineId: null,
    pendingBrowseCategoryId: null,
    ambiguityCount: 0,
  };
  return result(completedState, cartUpdatedReply(completedState, "✅ *Opciones guardadas*"));
}

function cartSummary(state: ConversationState) {
  const lines = cartBreakdown(state.cart);
  const subtotal = itemsSubtotal(state.cart);
  const fulfillment =
    state.serviceType === "domicilio"
      ? `\n📍 ${state.address}${state.addressReference ? `, ${state.addressReference}` : ""}\nEnvío: $${state.deliveryQuote?.totalFee ?? 0}`
      : "\nPara recoger en Mideli";
  const payment = state.payment ? `\nPago: ${state.payment.method}` : "";
  return `🧾 *Resumen de tu pedido*\n\n${lines}\n\nSubtotal: *$${subtotal}*${fulfillment}${payment}\n*Total: $${state.total}*\n\n¿Confirmas el pedido? 😊`;
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
    addressReference: "",
    deliveryQuote: null,
    deliveryQuoteAttempts: 0,
    savedAddress: null,
    payment: null,
    beveragesOffered: false,
    catalogPage: 0,
    selectedCategoryId: null,
    pendingBrowseCategoryId: null,
    ambiguityCount: 0,
    nextLineNumber: 1,
  };
}

export function hydrateConversation(
  value: Partial<ConversationState>,
  phone: string
): ConversationState {
  return {
    ...createConversation(phone),
    ...value,
    phone: normalizePhone(phone),
    cart: Array.isArray(value.cart) ? value.cart : [],
    addressReference: value.addressReference ?? "",
    deliveryQuote: value.deliveryQuote ?? null,
    deliveryQuoteAttempts: value.deliveryQuoteAttempts ?? 0,
    savedAddress: value.savedAddress ?? null,
    beveragesOffered: value.beveragesOffered ?? false,
    catalogPage: value.catalogPage ?? 0,
    selectedCategoryId: value.selectedCategoryId ?? null,
    pendingBrowseCategoryId: value.pendingBrowseCategoryId ?? null,
  };
}

function foodCategories(catalog: ConversationCatalog) {
  const ids = new Set(
    catalog.items
      .filter((item) => !item.isBeverage && !item.isAlcoholic)
      .map((item) => item.categoryId)
  );
  return catalog.categories.filter((category) => ids.has(category.id));
}

function categoryMessage(catalog: ConversationCatalog, page: number) {
  const categories = foodCategories(catalog);
  const start = Math.max(0, page) * DEFAULT_PAGE_SIZE;
  const visible = categories.slice(start, start + DEFAULT_PAGE_SIZE);
  if (visible.length === 0) return "No hay más categorías disponibles. Escribe volver para regresar.";
  const lines = visible
    .map((category, index) => `${index + 1}. ${categoryEmoji(category.name)} *${category.name}*`)
    .join("\n");
  const more = start + visible.length < categories.length ? "\n\nEscribe *más* para ver otras." : "";
  return `🍽️ *¿Qué se te antoja?*\n\n${lines}${more}`;
}

function catalogItemsForSelection(state: ConversationState, catalog: ConversationCatalog) {
  if (state.selectedCategoryId === "__beverages__") {
    return catalog.items.filter((item) => item.isBeverage && !item.isAlcoholic);
  }
  if (state.selectedCategoryId === "__alcohol__") {
    return catalog.items.filter((item) => item.isAlcoholic);
  }
  return catalog.items.filter((item) => item.categoryId === state.selectedCategoryId);
}

function productMessage(state: ConversationState, catalog: ConversationCatalog) {
  const items = catalogItemsForSelection(state, catalog);
  const start = Math.max(0, state.catalogPage) * DEFAULT_PAGE_SIZE;
  const visible = items.slice(start, start + DEFAULT_PAGE_SIZE);
  if (visible.length === 0) return "No hay más productos disponibles. Escribe volver para elegir otra categoría.";
  const selectedCategory = catalog.categories.find((item) => item.id === state.selectedCategoryId);
  const categoryName = state.selectedCategoryId === "__beverages__"
    ? "Bebidas"
    : state.selectedCategoryId === "__alcohol__"
      ? "Cervezas"
      : selectedCategory?.name ?? visible[0]?.categoryName ?? "Menú";
  const lines = visible
    .map((item, index) => {
      const description = item.description ? `\n   ${item.description}` : "";
      return `${index + 1}. *${item.name}* · $${item.price}${description}`;
    })
    .join("\n\n");
  const more = start + visible.length < items.length ? "\n\nEscribe *más* para ver otros." : "";
  return `${categoryEmoji(categoryName)} *${categoryName}*\n\n${lines}${more}\n\nResponde con el número o el nombre.`;
}

function selectedPageItems(state: ConversationState, catalog: ConversationCatalog) {
  const items = catalogItemsForSelection(state, catalog);
  const start = Math.max(0, state.catalogPage) * DEFAULT_PAGE_SIZE;
  return items.slice(start, start + DEFAULT_PAGE_SIZE);
}

function categoryFromText(text: string, catalog: ConversationCatalog) {
  return foodCategories(catalog)
    .flatMap((category) =>
      categoryAliases(category.name).flatMap((alias) => {
        const index = ` ${text} `.lastIndexOf(` ${alias} `);
        return index >= 0 ? [{ category, index }] : [];
      })
    )
    .sort((left, right) => right.index - left.index)[0]?.category;
}

function requestedNavigationCategory(
  text: string,
  catalog: ConversationCatalog,
  hasProductMatches: boolean
) {
  const category = categoryFromText(text, catalog);
  if (!category || !hasProductMatches) return category;
  const explicitlyBrowsing = ["menu", "ver", "mostrar", "muestrame", "ensename"].some(
    (phrase) => includesPhrase(text, phrase)
  );
  return explicitlyBrowsing ? category : undefined;
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

  const distributed = distributePendingModifiers(
    state,
    line,
    catalogItem,
    message,
    catalog
  );
  if (distributed) {
    return finishModifierSelection(state, distributed, line, catalog);
  }

  let additions = matchItemModifiers(catalogItem, message);
  const numeric = Number.parseInt(normalizeText(message), 10);
  if (additions.length === 0 && Number.isInteger(numeric) && numeric > 0) {
    const missing = missingRequiredGroups(catalogItem, line.selectedModifiers)[0];
    const option = missing?.options[numeric - 1];
    if (missing && option) {
      const groupIndex = catalogItem.modifiers.indexOf(missing);
      additions = [{
        groupId: missing.id ?? `group-${groupIndex}`,
        groupName: missing.name,
        optionId: option.id ?? `option-${groupIndex}-${numeric - 1}`,
        optionName: option.name,
        price: Number(option.price),
      }];
    }
  }

  if (additions.length === 0) {
    return result(state, modifierQuestion(line, catalog));
  }

  const selectedModifiers = mergeModifiers(
    line.selectedModifiers,
    additions,
    catalog,
    line.menuItemId
  );
  const cart = state.cart.map((item) =>
    item.id === line.id ? { ...item, selectedModifiers } : item
  );
  return finishModifierSelection(state, cart, line, catalog);
}

function addMatches(
  state: ConversationState,
  matches: ReturnType<typeof findCatalogProducts>,
  catalog: ConversationCatalog
) {
  let nextLineNumber = state.nextLineNumber;
  const additions: ConversationCartLine[] = [];
  for (const match of matches) {
    const selectedModifiers = matchItemModifiers(match.item, match.segment);
    const requiresUnitSelection = match.item.modifiers.some(
      (group) => group.required && (group.selection_mode ?? "single") === "single"
    );
    const lineCount = requiresUnitSelection ? match.quantity : 1;
    for (let index = 0; index < lineCount; index += 1) {
      additions.push({
        id: `line-${nextLineNumber}`,
        menuItemId: match.item.id,
        categoryId: match.item.categoryId,
        name: match.item.name,
        quantity: requiresUnitSelection ? 1 : match.quantity,
        unitPrice: match.item.price,
        selectedModifiers: [...selectedModifiers],
        notes: "",
      });
      nextLineNumber += 1;
    }
  }
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
    { ...nextState, stage: "ordering", ambiguityCount: 0, nextLineNumber },
    cartUpdatedReply(
      { ...nextState, stage: "ordering", ambiguityCount: 0, nextLineNumber },
      "✅😋 *¡Buena elección! Ya lo agregué*"
    )
  );
}

function addMatchesAndMaybeBrowse(
  state: ConversationState,
  matches: ReturnType<typeof findCatalogProducts>,
  categoryId: string | null,
  catalog: ConversationCatalog
) {
  const added = addMatches(state, matches, catalog);
  if (!categoryId) return added;
  if (added.state.stage === "awaiting_modifiers") {
    return {
      ...added,
      state: { ...added.state, pendingBrowseCategoryId: categoryId },
      reply: `${added.reply}\n\nDespués te muestro esa categoría.`,
    };
  }
  const browsingState: ConversationState = {
    ...added.state,
    stage: "browsing_catalog",
    selectedCategoryId: categoryId,
    pendingBrowseCategoryId: null,
    catalogPage: 0,
  };
  return result(browsingState, `${added.reply}\n\n${productMessage(browsingState, catalog)}`);
}

function productQuantity(cart: ConversationCartLine[], menuItemId: string) {
  return cart
    .filter((line) => line.menuItemId === menuItemId)
    .reduce((total, line) => total + line.quantity, 0);
}

function removeProductQuantity(
  cart: ConversationCartLine[],
  menuItemId: string,
  requestedQuantity: number | null
) {
  let remaining = requestedQuantity ?? Number.POSITIVE_INFINITY;
  return cart.flatMap((line) => {
    if (line.menuItemId !== menuItemId || remaining <= 0) return [line];
    if (remaining >= line.quantity) {
      remaining -= line.quantity;
      return [];
    }
    const next = { ...line, quantity: line.quantity - remaining };
    remaining = 0;
    return [next];
  });
}

function replacementParts(text: string) {
  const delimiter = " por ";
  const index = text.indexOf(delimiter);
  if (index < 0) return null;
  return {
    source: text.slice(0, index).trim(),
    target: text.slice(index + delimiter.length).trim(),
  };
}

function handleProductReplacement(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult | null {
  const text = normalizeText(message);
  if (!/^(cambia|cambiar|cambiame|reemplaza|reemplazar)\b/.test(text)) return null;
  const parts = replacementParts(text);
  if (!parts) return null;
  const source = findCatalogProducts(parts.source, catalog)[0];
  const target = findCatalogProducts(parts.target, catalog)[0];
  if (!source || !target || source.item.id === target.item.id) return null;

  const available = productQuantity(state.cart, source.item.id);
  if (available === 0) {
    return result(state, `No encontré ${source.item.name} en tu pedido actual.`);
  }
  const explicit = explicitQuantityFromText(parts.source);
  if (explicit === null && available > 1) {
    return result(
      state,
      `Tienes ${available} ${source.item.name}. ¿Cuántos deseas cambiar por ${target.item.name}?`
    );
  }
  const quantity = Math.min(available, explicit ?? 1);
  const withoutSource = withCart(
    state,
    removeProductQuantity(state.cart, source.item.id, quantity)
  );
  const added = addMatches(
    withoutSource,
    [{ ...target, quantity, segment: parts.target }],
    catalog
  );
  if (added.state.stage === "awaiting_modifiers") {
    return {
      ...added,
      reply: `🔄 Cambiaré ${quantity} ${source.item.name} por ${quantity} ${target.item.name}.\n\n${added.reply}`,
    };
  }
  return result(
    added.state,
    cartUpdatedReply(added.state, "🔄 *Cambio realizado*")
  );
}

function explodeConfiguredLines(state: ConversationState) {
  let nextLineNumber = state.nextLineNumber;
  const cart = state.cart.flatMap((line) => {
    if (line.quantity <= 1 || line.selectedModifiers.length === 0) return [line];
    return Array.from({ length: line.quantity }, (_, index) => {
      if (index === 0) return { ...line, quantity: 1 };
      const copy = {
        ...line,
        id: `line-${nextLineNumber}`,
        quantity: 1,
        selectedModifiers: [...line.selectedModifiers],
      };
      nextLineNumber += 1;
      return copy;
    });
  });
  return { ...withCart(state, cart), nextLineNumber };
}

function handleModifierReplacement(
  rawState: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult | null {
  const text = normalizeText(message);
  if (!/^(cambia|cambiar|cambiame|reemplaza|reemplazar)\b/.test(text)) return null;
  const parts = replacementParts(text);
  if (!parts) return null;
  const state = explodeConfiguredLines(rawState);
  const eligible = state.cart.filter((line) =>
    line.selectedModifiers.some((modifier) =>
      includesPhrase(parts.source, normalizeText(modifier.optionName))
    )
  );
  if (eligible.length === 0) return null;
  const sourceModifier = eligible[0].selectedModifiers.find((modifier) =>
    includesPhrase(parts.source, normalizeText(modifier.optionName))
  );
  const item = itemForLine(eligible[0], catalog);
  const group = item?.modifiers.find((candidate, groupIndex) =>
    (candidate.id ?? `group-${groupIndex}`) === sourceModifier?.groupId
  );
  const targetOptionIndex = group?.options.findIndex((option) =>
    includesPhrase(parts.target, normalizeText(option.name))
  ) ?? -1;
  const targetOption = targetOptionIndex >= 0 ? group?.options[targetOptionIndex] : null;
  if (!sourceModifier || !item || !group || !targetOption) return null;

  const explicit = explicitQuantityFromText(parts.source);
  if (explicit === null && eligible.length > 1) {
    return result(
      rawState,
      `Tienes ${eligible.length} con ${sourceModifier.optionName}. ¿Cuántos cambio a ${targetOption.name}?`
    );
  }
  const quantity = Math.min(eligible.length, explicit ?? 1);
  const targetIds = new Set(eligible.slice(0, quantity).map((line) => line.id));
  const groupIndex = item.modifiers.indexOf(group);
  const replacement = modifierFromOption(group, groupIndex, targetOption, targetOptionIndex);
  const cart = state.cart.map((line) =>
    targetIds.has(line.id)
      ? {
          ...line,
          selectedModifiers: mergeModifiers(
            line.selectedModifiers,
            [replacement],
            catalog,
            line.menuItemId
          ),
        }
      : line
  );
  const nextState = withCart({ ...state, ambiguityCount: 0 }, cart);
  return result(nextState, cartUpdatedReply(nextState, "🔄 *Cambio realizado*"));
}

function handleBrowsingCatalog(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult {
  const text = normalizeText(message);
  const requestedService = serviceTypeFromText(text);
  if (includesPhrase(text, "volver")) {
    const next = { ...state, selectedCategoryId: null, catalogPage: 0 };
    return result(next, categoryMessage(catalog, 0));
  }
  if (includesPhrase(text, "mas")) {
    const next = { ...state, catalogPage: state.catalogPage + 1 };
    return result(
      next,
      next.selectedCategoryId ? productMessage(next, catalog) : categoryMessage(catalog, next.catalogPage)
    );
  }

  const directMatches = findCatalogProducts(message, catalog);
  const requestedCategory = requestedNavigationCategory(
    text,
    catalog,
    directMatches.length > 0
  );
  if (directMatches.length > 0) {
    return rememberServiceType(
      addMatchesAndMaybeBrowse(
        state,
        directMatches,
        requestedCategory?.id ?? null,
        catalog
      ),
      requestedService
    );
  }

  if (requestedCategory) {
    const next = {
      ...state,
      selectedCategoryId: requestedCategory.id,
      catalogPage: 0,
    };
    return result(next, productMessage(next, catalog));
  }

  if (includesPhrase(text, "menu")) {
    const next = { ...state, selectedCategoryId: null, catalogPage: 0 };
    return result(next, categoryMessage(catalog, 0));
  }

  const numeric = Number.parseInt(text, 10);
  if (Number.isInteger(numeric) && numeric > 0) {
    if (state.selectedCategoryId) {
      const item = selectedPageItems(state, catalog)[numeric - 1];
      if (item) return addMatches(state, findCatalogProducts(item.name, catalog), catalog);
    } else {
      const start = state.catalogPage * DEFAULT_PAGE_SIZE;
      const category = foodCategories(catalog).slice(start, start + DEFAULT_PAGE_SIZE)[numeric - 1];
      if (category) {
        const next = { ...state, selectedCategoryId: category.id, catalogPage: 0 };
        return result(next, productMessage(next, catalog));
      }
    }
  }

  return result(
    state,
    state.selectedCategoryId
      ? `No encontré ese producto. ${productMessage(state, catalog)}`
      : categoryMessage(catalog, state.catalogPage)
  );
}

function deliveryAddressPrompt(state: ConversationState) {
  return state.savedAddress
    ? `📍 ¿Usamos tu domicilio anterior: ${state.savedAddress.address}? Responde sí o escribe otro domicilio.`
    : "📍 Compárteme la dirección completa o tu ubicación desde WhatsApp para calcular el envío 😊";
}

function continueAfterBeverages(state: ConversationState) {
  if (state.serviceType === "domicilio") {
    return result(
      { ...state, stage: "awaiting_address", deliveryQuote: null },
      deliveryAddressPrompt(state)
    );
  }
  if (state.serviceType === "para_llevar") {
    return result(
      { ...state, stage: "awaiting_payment" },
      `🛍️ Perfecto, será para recoger. ${paymentQuestion(state)}`
    );
  }
  return result(
    { ...state, stage: "awaiting_fulfillment" },
    "📍 ¿Tu pedido será para recoger o a domicilio?"
  );
}

function handleOrdering(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
) {
  const text = normalizeText(message);
  const requestedService = serviceTypeFromText(text);
  if (
    state.cart.length === 0 &&
    ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches"].some(
      (phrase) => text === phrase || includesPhrase(text, phrase)
    )
  ) {
    return result(
      { ...state, ambiguityCount: 0 },
      "¡Hola! 👋 Bienvenido a Mideli.\n\n¿Qué se te antoja hoy? Puedes pedir directo o escribir *menú* para ver las categorías."
    );
  }

  const modifierReplacement = handleModifierReplacement(state, message, catalog);
  if (modifierReplacement) return modifierReplacement;
  const productReplacement = handleProductReplacement(state, message, catalog);
  if (productReplacement) return productReplacement;

  const matches = findCatalogProducts(message, catalog);
  const requestedCategory = requestedNavigationCategory(text, catalog, matches.length > 0);
  const isRemoval = /^(quita|quitar|elimina|eliminar|borra|borrar)\b/.test(text);
  const isQuantityChange = /^(cambia|cambiar|deja|ajusta)\b/.test(text);

  if (matches.length > 0 && requestedCategory && !isRemoval && !isQuantityChange) {
    return rememberServiceType(
      addMatchesAndMaybeBrowse(state, matches, requestedCategory.id, catalog),
      requestedService
    );
  }

  if (requestedCategory) {
    const next = {
      ...state,
      stage: "browsing_catalog" as const,
      selectedCategoryId: requestedCategory.id,
      catalogPage: 0,
    };
    return result(next, productMessage(next, catalog));
  }

  if (includesPhrase(text, "menu")) {
    const next = { ...state, stage: "browsing_catalog" as const, selectedCategoryId: null, catalogPage: 0 };
    return result(next, categoryMessage(catalog, 0));
  }

  if (["bebida", "refresco", "agua", "limonada"].some((word) => includesPhrase(text, word))) {
    const next = { ...state, stage: "browsing_catalog" as const, selectedCategoryId: "__beverages__", catalogPage: 0 };
    return result(next, productMessage(next, catalog));
  }

  if (["cerveza", "cheve", "caguama"].some((word) => includesPhrase(text, word))) {
    const next = { ...state, stage: "browsing_catalog" as const, selectedCategoryId: "__alcohol__", catalogPage: 0 };
    return result(next, productMessage(next, catalog));
  }

  if (isDoneIntent(text)) {
    if (state.cart.length === 0) {
      return result(state, "Tu pedido está vacío. Dime qué platillo deseas agregar.");
    }
    if (!state.beveragesOffered) {
      return result(
        { ...state, stage: "awaiting_beverage", beveragesOffered: true, ambiguityCount: 0 },
        "🥤 *¿Algo para tomar?*\n\n¿Deseas agregar alguna bebida a tu pedido? 😊"
      );
    }
    return continueAfterBeverages({ ...state, ambiguityCount: 0 });
  }

  const matchedItemIds = new Set(matches.map((match) => match.item.id));
  if (isRemoval && matches.length > 0) {
    const explicit = explicitQuantityFromText(text);
    const previousMatchedQuantity = [...matchedItemIds].reduce(
      (total, menuItemId) => total + productQuantity(state.cart, menuItemId),
      0
    );
    let cart = state.cart;
    for (const menuItemId of matchedItemIds) {
      cart = removeProductQuantity(cart, menuItemId, explicit);
    }
    const nextMatchedQuantity = [...matchedItemIds].reduce(
      (total, menuItemId) => total + productQuantity(cart, menuItemId),
      0
    );
    if (nextMatchedQuantity === previousMatchedQuantity) {
      return result(state, "Ese producto no está en tu pedido actual.");
    }
    const nextState = withCart({ ...state, ambiguityCount: 0 }, cart);
    return result(nextState, cartUpdatedReply(nextState, "🗑️ *Listo, lo retiré*"));
  }

  if (isQuantityChange && matches.length > 0) {
    const quantity = quantityFromText(text);
    const menuItemId = matches[0].item.id;
    const requiresUnitSelection = matches[0].item.modifiers.some(
      (group) => group.required && (group.selection_mode ?? "single") === "single"
    );
    const existing = state.cart.filter((line) => line.menuItemId === menuItemId);
    const currentQuantity = productQuantity(state.cart, menuItemId);
    if (existing.length === 0) return result(state, "Ese producto no está en tu pedido actual.");
    let cart = state.cart;
    let nextLineNumber = state.nextLineNumber;
    if (!requiresUnitSelection) {
      const firstId = existing[0].id;
      cart = cart
        .filter((line) => line.menuItemId !== menuItemId || line.id === firstId)
        .map((line) => line.id === firstId ? { ...line, quantity } : line);
    } else if (quantity < currentQuantity) {
      cart = removeProductQuantity(cart, menuItemId, currentQuantity - quantity);
    } else if (quantity > currentQuantity) {
      const template = existing[existing.length - 1];
      const additional = quantity - currentQuantity;
      if (template.quantity > 1 && existing.length === 1) {
        cart = cart.map((line) =>
          line.id === template.id ? { ...line, quantity } : line
        );
      } else {
        for (let index = 0; index < additional; index += 1) {
          cart.push({
            ...template,
            id: `line-${nextLineNumber}`,
            quantity: 1,
            selectedModifiers: [...template.selectedModifiers],
          });
          nextLineNumber += 1;
        }
      }
    }
    const nextState = withCart(
      { ...state, ambiguityCount: 0, nextLineNumber },
      cart
    );
    return result(nextState, cartUpdatedReply(nextState));
  }

  if (matches.length > 0) {
    return rememberServiceType(addMatches(state, matches, catalog), requestedService);
  }

  if (requestedService) {
    const nextState = withServiceType(state, requestedService);
    const label = requestedService === "domicilio" ? "a domicilio" : "para recoger";
    return result(
      nextState,
      `📍 Perfecto, anoté que será *${label}*. ¿Deseas agregar algo más? 😊`
    );
  }

  if (isNegative(text)) {
    return result(
      { ...state, ambiguityCount: 0 },
      state.cart.length > 0
        ? "Sin problema 😊 ¿Quieres agregar algo más o terminamos tu pedido?"
        : "Sin problema 😊 Cuando estés listo, dime qué se te antoja o escribe *menú*."
    );
  }

  const ambiguityCount = state.ambiguityCount + 1;
  if (ambiguityCount >= 2) {
    return result(
      { ...state, stage: "handoff", ambiguityCount },
      "Quiero ayudarte sin hacerte perder tiempo 😊 Una persona del equipo continuará contigo.",
      "handoff"
    );
  }
  return result(
    { ...state, ambiguityCount },
    "No encontré ese producto en el menú actual. Puedes escribir *menú* para ver opciones o intentar con otro nombre."
  );
}

function handleBeverage(state: ConversationState, message: string, catalog: ConversationCatalog) {
  const text = normalizeText(message);
  if (isNegative(text)) {
    return continueAfterBeverages(state);
  }
  const matches = findCatalogProducts(message, catalog).filter(
    (match) => match.item.isBeverage && !match.item.isAlcoholic
  );
  if (matches.length > 0) return addMatches(state, matches, catalog);
  const next = { ...state, stage: "browsing_catalog" as const, selectedCategoryId: "__beverages__", catalogPage: 0 };
  return result(next, productMessage(next, catalog));
}

function handleFulfillment(state: ConversationState, message: string) {
  const text = normalizeText(message);
  const serviceType = serviceTypeFromText(text);
  if (serviceType === "domicilio") {
    const nextState = withServiceType(state, serviceType);
    return result(
      {
        ...nextState,
        stage: "awaiting_address",
      },
      deliveryAddressPrompt(nextState)
    );
  }
  if (serviceType === "para_llevar") {
    const nextState = withServiceType(state, serviceType);
    return result(
      { ...nextState, stage: "awaiting_payment" },
      `🛍️ Perfecto, será para recoger. ${paymentQuestion(nextState)}`
    );
  }
  return result(state, "📍 Solo me falta saber si será para recoger o a domicilio.");
}

function handleAddress(state: ConversationState, message: string) {
  const text = normalizeText(message);
  if (state.savedAddress && isConfirmation(text)) {
    return result(
      {
        ...state,
        address: state.savedAddress.address,
        addressReference: state.savedAddress.reference,
        stage: "awaiting_delivery_quote",
      },
      "Estoy actualizando la cobertura y el costo de envío para ese domicilio.",
      "request_delivery_quote"
    );
  }
  if (state.savedAddress && isNegative(text)) {
    return result(
      { ...state, savedAddress: null },
      "Perfecto. Escribe la nueva dirección completa o comparte tu ubicación."
    );
  }
  if (text.length < 8) {
    return result(state, "Necesito una dirección un poco más completa para evitar retrasos.");
  }
  return result(
    { ...state, address: message.trim(), stage: "awaiting_address_reference" },
    "🏠 ¿Hay alguna referencia que ayude a encontrar el domicilio? Si no, escribe *omitir*."
  );
}

function handleAddressReference(state: ConversationState, message: string) {
  const text = normalizeText(message);
  const reference = includesPhrase(text, "omitir") || text === "no" ? "" : message.trim();
  return result(
    { ...state, addressReference: reference, stage: "awaiting_delivery_quote" },
    "🛵 Estoy ubicando tu domicilio y calculando el envío. Dame un momento 😊",
    "request_delivery_quote"
  );
}

function paymentQuestion(state: ConversationState) {
  return state.serviceType === "domicilio"
    ? "💳 ¿Pagarás en efectivo o por transferencia?"
    : "💳 ¿Pagarás en efectivo, tarjeta o transferencia?";
}

function handlePayment(state: ConversationState, message: string) {
  const text = normalizeText(message);
  let method: "efectivo" | "tarjeta" | "transferencia" | null = null;
  if (includesPhrase(text, "efectivo")) method = "efectivo";
  else if (includesPhrase(text, "tarjeta")) method = "tarjeta";
  else if (includesPhrase(text, "transferencia") || includesPhrase(text, "transfer")) {
    method = "transferencia";
  }

  if (!method || (state.serviceType === "domicilio" && method === "tarjeta")) {
    return result(state, paymentQuestion(state));
  }

  const amountMatch = method === "efectivo" ? text.match(/(?:con|de)\s+\$?(\d+)/) : null;
  const cashTendered = amountMatch ? Number(amountMatch[1]) : null;
  if (method === "efectivo" && cashTendered === null) {
    return result(
      { ...state, payment: { method, cashTendered: null }, stage: "awaiting_cash_tendered" },
      `💵 El total es *$${state.total}*. ¿Con cuánto pagarás?`
    );
  }
  if (cashTendered !== null && cashTendered < state.total) {
    return result(state, `El total es $${state.total}. Indícame una cantidad suficiente.`);
  }

  const nextState: ConversationState = {
    ...state,
    payment: { method, cashTendered },
    stage: "awaiting_confirmation",
  };
  return result(nextState, cartSummary(nextState));
}

function handleCashTendered(state: ConversationState, message: string) {
  const amount = Number(normalizeText(message).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount < state.total) {
    return result(state, `💵 El total es *$${state.total}*. ¿Con cuánto pagarás?`);
  }
  const nextState: ConversationState = {
    ...state,
    payment: { method: "efectivo", cashTendered: amount },
    stage: "awaiting_confirmation",
  };
  return result(nextState, cartSummary(nextState));
}

function handleConfirmation(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
) {
  const text = normalizeText(message);
  if (isConfirmation(text)) {
    return result(
      { ...state, stage: "confirmed" },
      "✅ ¡Perfecto! Estoy confirmando tu pedido con el equipo 😊",
      "request_order_creation"
    );
  }
  if (
    includesPhrase(text, "modificar") ||
    /^(cambia|cambiar|cambiame|reemplaza|reemplazar|quita|quitar|elimina|eliminar)\b/.test(text)
  ) {
    return handleOrdering(
      { ...state, stage: "ordering", payment: null, ambiguityCount: 0 },
      message,
      catalog
    );
  }
  if (includesPhrase(text, "cancelar")) {
    return result({ ...state, stage: "cancelled" }, "El pedido fue cancelado.");
  }
  return result(state, "Escribe confirmar para enviar el pedido o modificar para hacer cambios.");
}

function handleLateConversationChange(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult | null {
  if (state.cart.length === 0) return null;
  const text = normalizeText(message);
  const serviceType = serviceTypeFromText(text);
  const editableStages: ConversationState["stage"][] = [
    "awaiting_address",
    "awaiting_address_reference",
    "awaiting_delivery_quote",
    "awaiting_payment",
    "awaiting_cash_tendered",
    "awaiting_confirmation",
  ];
  if (!editableStages.includes(state.stage)) return null;

  if (
    state.serviceType === "domicilio" &&
    /\b(cambia|cambiar|corrige|corregir|otra|nuevo|nueva)\b.*\b(direccion|domicilio|ubicacion)\b/.test(text)
  ) {
    const nextState = withServiceType(state, "domicilio");
    return result(
      {
        ...nextState,
        address: null,
        addressReference: "",
        payment: null,
        stage: "awaiting_address",
      },
      "📍 Claro, actualizamos el domicilio. Escribe la nueva dirección completa o comparte tu ubicación 😊"
    );
  }

  const productEdit = /^(cambia|cambiar|cambiame|reemplaza|reemplazar|quita|quitar|elimina|eliminar|borra|borrar)\b/.test(text);
  const productAddition = /^(agrega|agregar|anade|añade|sumale|pon)\b/.test(text) &&
    findCatalogProducts(message, catalog).length > 0;
  if (productEdit || productAddition) {
    return handleOrdering(
      { ...state, stage: "ordering", payment: null, ambiguityCount: 0 },
      message,
      catalog
    );
  }

  if (!serviceType || serviceType === state.serviceType) return null;
  const nextState = withServiceType(state, serviceType);
  if (serviceType === "domicilio") {
    return result(
      { ...nextState, payment: null, stage: "awaiting_address" },
      `🛵 Listo, cambié el pedido a domicilio.\n\n${deliveryAddressPrompt(nextState)}`
    );
  }
  return result(
    { ...nextState, payment: null, stage: "awaiting_payment" },
    `🛍️ Listo, cambié el pedido para recoger.\n\n${paymentQuestion(nextState)}`
  );
}

export function handleConversationMessage(
  rawState: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult {
  const state = hydrateConversation(rawState, rawState.phone);
  const text = normalizeText(message);

  if (requestsHuman(text)) {
    return result(
      { ...state, stage: "handoff" },
      "Claro. Una persona del equipo continuará contigo.",
      "handoff"
    );
  }

  const lateChange = handleLateConversationChange(state, message, catalog);
  if (lateChange) return lateChange;

  if (state.stage === "awaiting_modifiers") return handlePendingModifiers(state, message, catalog);
  if (state.stage === "ordering") return handleOrdering(state, message, catalog);
  if (state.stage === "browsing_catalog") return handleBrowsingCatalog(state, message, catalog);
  if (state.stage === "awaiting_beverage") return handleBeverage(state, message, catalog);
  if (state.stage === "awaiting_fulfillment") return handleFulfillment(state, message);
  if (state.stage === "awaiting_address") return handleAddress(state, message);
  if (state.stage === "awaiting_address_reference") return handleAddressReference(state, message);
  if (state.stage === "awaiting_delivery_quote") {
    return result(state, "Sigo validando el domicilio. Si tarda demasiado, una persona te ayudará.");
  }
  if (state.stage === "awaiting_payment") return handlePayment(state, message);
  if (state.stage === "awaiting_cash_tendered") return handleCashTendered(state, message);
  if (state.stage === "awaiting_confirmation") return handleConfirmation(state, message, catalog);
  if (state.stage === "handoff") {
    return result(state, "Una persona del equipo continuará contigo en cuanto esté disponible.", "handoff");
  }
  if (state.stage === "confirmed") {
    if (confirmsArrival(text)) {
      return result(
        state,
        "¡Gracias por avisarnos! Esperamos que disfrutes tu pedido 😊",
        "mark_customer_received"
      );
    }
    if (requestsNewOrder(text)) {
      return handleOrdering(createConversation(state.phone), "hola", catalog);
    }
    return result(state, "Tu pedido ya fue confirmado. Si necesitas ayuda, escribe humano.");
  }
  if (requestsNewOrder(text)) {
    return handleOrdering(createConversation(state.phone), "hola", catalog);
  }
  return result(state, "Este pedido fue cancelado. Escribe hola para comenzar otro.");
}
