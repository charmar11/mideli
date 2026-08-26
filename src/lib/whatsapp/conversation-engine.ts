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
  ConversationCartReconciliation,
  ConversationCartLine,
  ConversationDeliveryQuote,
  ConversationModifier,
  ConversationResult,
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
    total: orderTotal(state.cart, deliveryQuote),
    stage: "awaiting_payment",
  };
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
  return `${categoryEmoji(item?.categoryName ?? "")} *${line.name}*\nElige *${group.name}*.${multiple}\n\n${options}`;
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
    .map((line) => {
      const options = line.selectedModifiers.map((modifier) => modifier.optionName).join(", ");
      return `• ${line.quantity}x ${line.name}${options ? ` (${options})` : ""}`;
    })
    .join("\n");
  const subtotal = itemsSubtotal(state.cart);
  const fulfillment =
    state.serviceType === "domicilio"
      ? `\n📍 ${state.address}${state.addressReference ? `, ${state.addressReference}` : ""}\nEnvío: $${state.deliveryQuote?.totalFee ?? 0}`
      : "\nPara recoger en Mideli";
  const payment = state.payment ? `\nPago: ${state.payment.method}` : "";
  return `🧾 *Resumen de tu pedido*\n\n${lines}\n\nSubtotal: *$${subtotal}*${fulfillment}${payment}\n*Total: $${state.total}*\n\n¿Confirmas el pedido?`;
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
      `✅ Listo, agregué las opciones de *${line.name}*.\n\n${productMessage(browsingState, catalog)}`
    );
  }

  return result(
    {
      ...nextState,
      stage: "ordering",
      pendingLineId: null,
      pendingBrowseCategoryId: null,
      ambiguityCount: 0,
    },
    `✅ Listo, agregué las opciones de *${line.name}*.\n🧾 Total actual: *$${nextState.total}*\n\n¿Deseas algo más?`
  );
}

function addMatches(
  state: ConversationState,
  matches: ReturnType<typeof findCatalogProducts>,
  catalog: ConversationCatalog
) {
  let nextLineNumber = state.nextLineNumber;
  const additions = matches.map((match) => {
    const selectedModifiers = matchItemModifiers(match.item, match.segment);
    const line: ConversationCartLine = {
      id: `line-${nextLineNumber}`,
      menuItemId: match.item.id,
      categoryId: match.item.categoryId,
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
    { ...nextState, stage: "ordering", ambiguityCount: 0, nextLineNumber },
    `✅ Agregué ${additions.map((line) => `*${line.quantity}x ${line.name}*`).join(", ")}.\n🧾 Total actual: *$${nextState.total}*\n\n¿Deseas algo más?`
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

function handleBrowsingCatalog(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
): ConversationResult {
  const text = normalizeText(message);
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
    return addMatchesAndMaybeBrowse(
      state,
      directMatches,
      requestedCategory?.id ?? null,
      catalog
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

function handleOrdering(
  state: ConversationState,
  message: string,
  catalog: ConversationCatalog
) {
  const text = normalizeText(message);
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

  const matches = findCatalogProducts(message, catalog);
  const requestedCategory = requestedNavigationCategory(text, catalog, matches.length > 0);

  if (matches.length > 0 && requestedCategory) {
    return addMatchesAndMaybeBrowse(state, matches, requestedCategory.id, catalog);
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
        "🥤 ¿Deseas agregar alguna bebida?"
      );
    }
    return result(
      { ...state, stage: "awaiting_fulfillment", ambiguityCount: 0 },
      "¿Tu pedido es para recoger o a domicilio?"
    );
  }

  const matchedItemIds = new Set(matches.map((match) => match.item.id));
  const isRemoval = /^(quita|quitar|elimina|eliminar|borra|borrar)\b/.test(text);
  if (isRemoval && matches.length > 0) {
    const cart = state.cart.filter((line) => !matchedItemIds.has(line.menuItemId));
    if (cart.length === state.cart.length) {
      return result(state, "Ese producto no está en tu pedido actual.");
    }
    const nextState = withCart({ ...state, ambiguityCount: 0 }, cart);
    return result(nextState, `Quité el producto. Total actual: $${nextState.total}.`);
  }

  const isQuantityChange = /^(cambia|cambiar|deja|ajusta)\b/.test(text);
  if (isQuantityChange && matches.length > 0) {
    const quantity = quantityFromText(text);
    const menuItemId = matches[0].item.id;
    const existingLine = state.cart.find((line) => line.menuItemId === menuItemId);
    if (!existingLine) return result(state, "Ese producto no está en tu pedido actual.");
    const cart = state.cart.map((line) =>
      line.id === existingLine.id ? { ...line, quantity } : line
    );
    const nextState = withCart({ ...state, ambiguityCount: 0 }, cart);
    return result(nextState, `Actualicé ${existingLine.name} a ${quantity}. Total: $${nextState.total}.`);
  }

  if (matches.length > 0) return addMatches(state, matches, catalog);

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
    return result(
      { ...state, stage: "awaiting_fulfillment" },
      "Perfecto. ¿Tu pedido es para recoger o a domicilio?"
    );
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
  if (["domicilio", "entrega", "envio"].some((word) => includesPhrase(text, word))) {
    const savedPrompt = state.savedAddress
      ? `¿Usamos tu domicilio anterior: ${state.savedAddress.address}? Responde sí o escribe otro domicilio.`
      : "Escribe la dirección completa o comparte tu ubicación desde WhatsApp.";
    return result(
      {
        ...state,
        serviceType: "domicilio",
        stage: "awaiting_address",
        deliveryQuote: null,
        total: itemsSubtotal(state.cart),
      },
      savedPrompt
    );
  }
  if (["recoger", "para llevar", "paso por"].some((phrase) => includesPhrase(text, phrase))) {
    return result(
      { ...state, serviceType: "para_llevar", stage: "awaiting_payment" },
      "¿Pagarás en efectivo, tarjeta o transferencia?"
    );
  }
  return result(state, "Indícame si es para recoger o a domicilio.");
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
    "¿Tienes alguna referencia para encontrar el domicilio? Si no, escribe omitir."
  );
}

function handleAddressReference(state: ConversationState, message: string) {
  const text = normalizeText(message);
  const reference = includesPhrase(text, "omitir") || text === "no" ? "" : message.trim();
  return result(
    { ...state, addressReference: reference, stage: "awaiting_delivery_quote" },
    "Estoy validando el domicilio y calculando el envío.",
    "request_delivery_quote"
  );
}

function paymentQuestion(state: ConversationState) {
  return state.serviceType === "domicilio"
    ? "¿Pagarás en efectivo o por transferencia?"
    : "¿Pagarás en efectivo, tarjeta o transferencia?";
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
      `El total es $${state.total}. ¿Con cuánto pagarás?`
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
    return result(state, `El total es $${state.total}. ¿Con cuánto pagarás?`);
  }
  const nextState: ConversationState = {
    ...state,
    payment: { method: "efectivo", cashTendered: amount },
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
      { ...state, stage: "ordering", payment: null },
      "Claro. Dime qué deseas agregar o cambiar."
    );
  }
  if (includesPhrase(text, "cancelar")) {
    return result({ ...state, stage: "cancelled" }, "El pedido fue cancelado.");
  }
  return result(state, "Escribe confirmar para enviar el pedido o modificar para hacer cambios.");
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
  if (state.stage === "awaiting_confirmation") return handleConfirmation(state, message);
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
