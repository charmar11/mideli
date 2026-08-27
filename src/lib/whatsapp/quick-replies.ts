import { missingRequiredGroups } from "./catalog";
import type {
  ConversationCatalog,
  ConversationCartLine,
  ConversationState,
} from "./types";

export type WhatsappQuickReply = {
  id: string;
  title: string;
};

export type WhatsappListRow = {
  id: string;
  title: string;
  description?: string;
};

export type WhatsappInteraction =
  | { kind: "buttons"; buttons: WhatsappQuickReply[] }
  | {
      kind: "list";
      buttonText: string;
      sections: Array<{ title?: string; rows: WhatsappListRow[] }>;
    };

const PAGE_SIZE = 5;

function encoded(value: string) {
  return encodeURIComponent(value);
}

function categoryEmoji(name: string) {
  const value = name.toLocaleLowerCase("es-MX");
  if (value.includes("hamburgues")) return "🍔";
  if (value.includes("sushi")) return "🍣";
  if (value.includes("boneless") || value.includes("alita")) return "🍗";
  if (value.includes("papa") || value.includes("compartir")) return "🍟";
  if (value.includes("bowl")) return "🥗";
  if (value.includes("bebida") || value.includes("refresco")) return "🥤";
  if (value.includes("cerveza") || value.includes("cheve")) return "🍺";
  return "🍽️";
}

function foodCategories(catalog: ConversationCatalog) {
  const ids = new Set(
    catalog.items
      .filter((item) => !item.isBeverage && !item.isAlcoholic)
      .map((item) => item.categoryId)
  );
  return catalog.categories.filter((category) => ids.has(category.id));
}

function selectedItems(state: ConversationState, catalog: ConversationCatalog) {
  if (state.selectedCategoryId === "__beverages__") {
    return catalog.items.filter((item) => item.isBeverage && !item.isAlcoholic);
  }
  if (state.selectedCategoryId === "__alcohol__") {
    return catalog.items.filter((item) => item.isAlcoholic);
  }
  return catalog.items.filter((item) => item.categoryId === state.selectedCategoryId);
}

function pageRows<T>(
  values: T[],
  page: number,
  row: (value: T) => WhatsappListRow,
  moreId: string,
  backId: string
) {
  const start = Math.max(0, page) * PAGE_SIZE;
  const visible = values.slice(start, start + PAGE_SIZE);
  const rows = visible.map(row);
  if (start + visible.length < values.length) {
    rows.push({ id: moreId, title: "Ver más", description: "Mostrar más opciones" });
  }
  rows.push({ id: backId, title: "Volver", description: "Regresar a la opción anterior" });
  return rows.slice(0, 10);
}

function cartLineDescription(line: ConversationCartLine) {
  const modifiers = line.selectedModifiers.map((modifier) => modifier.optionName).join(", ");
  return [
    `${line.quantity} × $${line.unitPrice}`,
    modifiers,
    line.notes,
  ].filter(Boolean).join(" · ");
}

function cartRows(state: ConversationState, action: string) {
  const rows = state.cart.slice(0, 9).map((line) => ({
    id: `edit:item:${encoded(line.id)}`,
    title: line.name,
    description: cartLineDescription(line),
  }));
  rows.push({
    id: "edit:summary",
    title: "Volver al resumen",
    description: `Cancelar ${action}`,
  });
  return rows;
}

function noteItemRows(state: ConversationState) {
  const rows = state.cart.slice(0, 9).map((line) => ({
    id: `note:item:${encoded(line.id)}`,
    title: line.name,
    description: cartLineDescription(line),
  }));
  rows.push({
    id: "note:cancel",
    title: "Cancelar",
    description: "Volver sin agregar indicación",
  });
  return rows;
}

export function interactionForState(
  state: ConversationState,
  catalog: ConversationCatalog
): WhatsappInteraction | null {
  if (state.stage === "ordering") {
    return state.cart.length === 0
      ? {
          kind: "buttons",
          buttons: [
            { id: "cmd:start", title: "Hacer pedido" },
            { id: "cmd:menu", title: "Ver menú" },
            { id: "cmd:human", title: "Hablar con alguien" },
          ],
        }
      : {
          kind: "buttons",
          buttons: [
            { id: "cart:add", title: "Agregar más" },
            { id: "cart:note", title: "Añadir nota" },
            { id: "cart:finish", title: "Terminar" },
          ],
        };
  }

  if (state.stage === "browsing_catalog") {
    if (!state.selectedCategoryId) {
      return {
        kind: "list",
        buttonText: "Ver categorías",
        sections: [{
          title: "Menú",
          rows: pageRows(
            foodCategories(catalog),
            state.catalogPage,
            (category) => ({
              id: `category:${encoded(category.id)}`,
              title: `${categoryEmoji(category.name)} ${category.name}`,
              description: "Ver productos",
            }),
            "catalog:more",
            state.catalogPage > 0 ? "catalog:previous" : "catalog:close"
          ),
        }],
      };
    }
    return {
      kind: "list",
      buttonText: "Elegir producto",
      sections: [{
        title: "Productos",
        rows: pageRows(
          selectedItems(state, catalog),
          state.catalogPage,
          (item) => ({
            id: `product:${encoded(item.id)}`,
            title: item.name,
            description: `$${item.price}${item.description ? ` · ${item.description}` : ""}`,
          }),
          "catalog:more",
          "catalog:categories"
        ),
      }],
    };
  }

  if (state.stage === "awaiting_modifiers") {
    const line = state.cart.find((candidate) => candidate.id === state.pendingLineId);
    const item = line
      ? catalog.items.find((candidate) => candidate.id === line.menuItemId)
      : null;
    const group = item ? missingRequiredGroups(item, line?.selectedModifiers ?? [])[0] : null;
    if (!group) return null;
    const groupIndex = item?.modifiers.indexOf(group) ?? 0;
    const groupId = group.id ?? `group-${groupIndex}`;
    const choices = group.options.map((option, optionIndex) => ({
      id: `modifier:${encoded(groupId)}:${encoded(option.id ?? `option-${groupIndex}-${optionIndex}`)}`,
      title: option.name,
      description: [
        Number(option.price) > 0 ? `+$${Number(option.price)}` : "",
        option.description ?? "",
      ].filter(Boolean).join(" · "),
    }));
    return choices.length <= 3
      ? {
          kind: "buttons",
          buttons: choices.map(({ id, title }) => ({ id, title })),
        }
      : {
          kind: "list",
          buttonText: `Elegir ${group.name}`,
          sections: [{ title: group.name, rows: choices.slice(0, 10) }],
        };
  }

  if (state.stage === "awaiting_beverage") {
    return {
      kind: "buttons",
      buttons: [
        { id: "beverage:show", title: "Ver bebidas" },
        { id: "beverage:skip", title: "No, gracias" },
        { id: "beverage:back", title: "Volver al pedido" },
      ],
    };
  }
  if (state.stage === "awaiting_fulfillment") {
    return {
      kind: "buttons",
      buttons: [
        { id: "fulfillment:pickup", title: "Para recoger" },
        { id: "fulfillment:delivery", title: "A domicilio" },
      ],
    };
  }
  if (state.stage === "awaiting_address" && state.savedAddress) {
    return {
      kind: "buttons",
      buttons: [
        { id: "address:reuse", title: "Usar domicilio" },
        { id: "address:new", title: "Otro domicilio" },
      ],
    };
  }
  if (state.stage === "awaiting_address_reference") {
    return { kind: "buttons", buttons: [{ id: "address:skip_reference", title: "Sin referencia" }] };
  }
  if (state.stage === "awaiting_address_confirmation") {
    return {
      kind: "buttons",
      buttons: [
        { id: "address:confirm", title: "Sí, es aquí" },
        { id: "address:change", title: "Cambiar dirección" },
        { id: "cmd:human", title: "Hablar con alguien" },
      ],
    };
  }
  if (state.stage === "awaiting_payment") {
    const buttons: WhatsappQuickReply[] = [
      { id: "payment:cash", title: "Efectivo" },
      { id: "payment:transfer", title: "Transferencia" },
    ];
    if (state.serviceType !== "domicilio") {
      buttons.splice(1, 0, { id: "payment:card", title: "Tarjeta" });
    }
    return { kind: "buttons", buttons };
  }
  if (state.stage === "awaiting_confirmation") {
    return {
      kind: "buttons",
      buttons: [
        { id: "confirmation:confirm", title: "Confirmar" },
        { id: "confirmation:edit", title: "Modificar" },
        { id: "confirmation:note", title: "Añadir nota" },
      ],
    };
  }
  if (state.stage === "awaiting_edit_action") {
    return {
      kind: "list",
      buttonText: "Elegir cambio",
      sections: [{
        title: "Modificar pedido",
        rows: [
          { id: "edit:action:add", title: "Agregar productos" },
          { id: "edit:action:remove", title: "Quitar producto" },
          { id: "edit:action:quantity", title: "Cambiar cantidad" },
          { id: "edit:action:modifiers", title: "Cambiar opciones" },
          { id: "edit:action:note", title: "Añadir indicación" },
          { id: "edit:action:fulfillment", title: "Cambiar entrega" },
          { id: "edit:action:address", title: "Cambiar domicilio" },
          { id: "edit:action:payment", title: "Cambiar pago" },
          { id: "edit:summary", title: "Ver resumen" },
        ],
      }],
    };
  }
  if (state.stage === "awaiting_edit_item") {
    const action = state.editContext?.action ?? "cambio";
    const eligible = action === "modifiers"
      ? state.cart.filter((line) =>
          catalog.items.find((item) => item.id === line.menuItemId)?.modifiers.length
        )
      : state.cart;
    return {
      kind: "list",
      buttonText: "Elegir producto",
      sections: [{
        title: "Tu pedido",
        rows: cartRows({ ...state, cart: eligible }, action),
      }],
    };
  }
  if (state.stage === "awaiting_edit_quantity") {
    return {
      kind: "list",
      buttonText: "Elegir cantidad",
      sections: [{
        title: "Nueva cantidad",
        rows: [
          ...Array.from({ length: 9 }, (_, index) => ({
            id: `edit:quantity:${index + 1}`,
            title: `${index + 1}`,
          })),
          { id: "edit:summary", title: "Cancelar" },
        ],
      }],
    };
  }
  if (state.stage === "awaiting_edit_modifier_group") {
    const line = state.cart.find((candidate) => candidate.id === state.editContext?.targetLineId);
    const item = line
      ? catalog.items.find((candidate) => candidate.id === line.menuItemId)
      : null;
    if (!item) return null;
    return {
      kind: "list",
      buttonText: "Elegir opción",
      sections: [{
        title: line?.name ?? item.name,
        rows: [
          ...item.modifiers.slice(0, 9).map((group, index) => ({
            id: `edit:group:${encoded(group.id ?? `group-${index}`)}`,
            title: group.name,
            description: group.required ? "Requerida" : "Opcional",
          })),
          { id: "edit:summary", title: "Volver al resumen" },
        ],
      }],
    };
  }
  if (state.stage === "awaiting_edit_modifier_option") {
    const line = state.cart.find((candidate) => candidate.id === state.editContext?.targetLineId);
    const item = line
      ? catalog.items.find((candidate) => candidate.id === line.menuItemId)
      : null;
    const group = item?.modifiers.find((candidate, index) =>
      (candidate.id ?? `group-${index}`) === state.editContext?.targetGroupId
    );
    if (!group) return null;
    const rows: WhatsappListRow[] = group.options
      .slice(0, group.required ? 9 : 8)
      .map((option, index) => ({
        id: `edit:option:${encoded(option.id ?? `option-${index}`)}`,
        title: option.name,
        description: Number(option.price) > 0 ? `+$${Number(option.price)}` : undefined,
      }));
    if (!group.required) rows.push({ id: "edit:option:clear", title: "Sin esta opción" });
    rows.push({ id: "edit:summary", title: "Volver al resumen" });
    return {
      kind: "list",
      buttonText: "Elegir valor",
      sections: [{ title: group.name, rows }],
    };
  }
  if (state.stage === "awaiting_edit_modifier_more") {
    return {
      kind: "buttons",
      buttons: [
        { id: "edit:modifier:more", title: "Agregar otra" },
        { id: "edit:modifier:done", title: "Listo" },
        { id: "edit:summary", title: "Ver resumen" },
      ],
    };
  }
  if (state.stage === "awaiting_note_scope") {
    return {
      kind: "buttons",
      buttons: [
        { id: "note:scope:product", title: "A un producto" },
        { id: "note:scope:order", title: "A todo el pedido" },
        { id: "note:scope:delivery", title: "Para la entrega" },
      ],
    };
  }
  if (state.stage === "awaiting_note_item") {
    return {
      kind: "list",
      buttonText: "Elegir producto",
      sections: [{ title: "Tu pedido", rows: noteItemRows(state) }],
    };
  }
  if (state.stage === "awaiting_note_quantity_scope") {
    return {
      kind: "buttons",
      buttons: [
        { id: "note:quantity:all", title: "Todas" },
        { id: "note:quantity:one", title: "Solo una" },
        { id: "note:cancel", title: "Cancelar" },
      ],
    };
  }
  if (state.stage === "confirmed") {
    return {
      kind: "buttons",
      buttons: [
        { id: "cmd:start", title: "Nuevo pedido" },
        { id: "cmd:human", title: "Necesito ayuda" },
      ],
    };
  }
  return null;
}
