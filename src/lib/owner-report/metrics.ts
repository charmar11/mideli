import type {
  OwnerAction,
  ProductProfitability,
} from "@/lib/owner-report/types";

export interface ProfitabilityMenuItem {
  id: string;
  name: string;
  price: number;
}

export interface ProfitabilityRecipeRow {
  menuItemId: string;
  quantity: number;
  modifierOptionId: string | null;
  unitCost: number;
}

export function calculateProductProfitability(
  menuItems: ProfitabilityMenuItem[],
  recipes: ProfitabilityRecipeRow[]
): ProductProfitability[] {
  const baseCosts = new Map<string, number>();

  for (const recipe of recipes) {
    if (recipe.modifierOptionId) continue;
    baseCosts.set(
      recipe.menuItemId,
      (baseCosts.get(recipe.menuItemId) ?? 0) + recipe.quantity * recipe.unitCost
    );
  }

  return menuItems.map((item) => {
    const hasRecipe = baseCosts.has(item.id);
    const estimatedCost = baseCosts.get(item.id) ?? 0;
    const estimatedMargin = item.price - estimatedCost;

    return {
      id: item.id,
      name: item.name,
      price: item.price,
      estimatedCost,
      estimatedMargin,
      marginPercent:
        hasRecipe && item.price > 0 ? (estimatedMargin / item.price) * 100 : null,
      recipeStatus: hasRecipe ? "configured" : "missing",
    };
  });
}

export function buildOwnerActions(input: {
  cashDifference: number;
  lowStockNames: string[];
  delayedOrders: number;
  missingRecipes: number;
  lowMarginProducts: ProductProfitability[];
}): OwnerAction[] {
  const actions: OwnerAction[] = [];

  if (Math.abs(input.cashDifference) >= 0.01) {
    actions.push({
      id: "cash-difference",
      title: "Revisar diferencia de caja",
      detail: `Los cortes del periodo tienen una diferencia neta de ${formatCurrency(input.cashDifference)}.`,
      tone: "danger",
      href: "/settings/caja",
    });
  }

  if (input.lowStockNames.length > 0) {
    actions.push({
      id: "low-stock",
      title: "Preparar reposición",
      detail: `${input.lowStockNames.slice(0, 3).join(", ")}${input.lowStockNames.length > 3 ? " y más" : ""} requieren atención.`,
      tone: "warning",
      href: "/settings/inventario?tab=comprar",
    });
  }

  if (input.delayedOrders > 0) {
    actions.push({
      id: "kitchen-delay",
      title: "Revisar tiempos de cocina",
      detail: `${input.delayedOrders} ${input.delayedOrders === 1 ? "pedido tardó" : "pedidos tardaron"} 15 minutos o más en preparación.`,
      tone: "warning",
      href: "/dashboard/cocina",
    });
  }

  if (input.lowMarginProducts.length > 0) {
    actions.push({
      id: "low-margin",
      title: "Revisar margen estimado",
      detail: `${input.lowMarginProducts[0].name} tiene uno de los márgenes configurados más bajos.`,
      tone: "brand",
      href: "/settings/inventario?tab=recetas",
    });
  }

  if (input.missingRecipes > 0) {
    actions.push({
      id: "missing-recipes",
      title: "Completar recetas",
      detail: `${input.missingRecipes} ${input.missingRecipes === 1 ? "producto no puede" : "productos no pueden"} calcular rentabilidad todavía.`,
      tone: "brand",
      href: "/settings/inventario?tab=recetas",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "all-clear",
      title: "Operación sin alertas",
      detail: "No hay diferencias, demoras ni faltantes configurados que requieran acción.",
      tone: "success",
    });
  }

  return actions.slice(0, 4);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}
