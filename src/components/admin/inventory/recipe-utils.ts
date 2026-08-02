import type {
  Category,
  InventoryItem,
  InventoryRecipe,
  MenuItem,
  ModifierGroup,
  ModifierOption,
} from "@/types/database";

export type RecipeCoverageStatus = "configured" | "partial" | "missing";

export type RecipeIngredient = {
  recipe: InventoryRecipe;
  item: InventoryItem | null;
  cost: number;
};

export type RecipeTargetSummary = {
  key: string;
  label: string;
  description: string;
  group: ModifierGroup | null;
  option: ModifierOption | null;
  optionId: string | null;
  ingredients: RecipeIngredient[];
  estimatedCost: number;
  configured: boolean;
  canEdit: boolean;
  orphaned: boolean;
};

export type ProductRecipeSummary = {
  menuItem: MenuItem;
  categoryName: string;
  status: RecipeCoverageStatus;
  targets: RecipeTargetSummary[];
  configuredTargets: number;
  totalTargets: number;
  estimatedBaseCost: number;
  ingredientNames: string[];
  orphanedRecipeCount: number;
};

function recipeTargetKey(optionId: string | null | undefined) {
  return optionId ? `option:${optionId}` : "base";
}

function ingredientRows(
  targetRecipes: InventoryRecipe[],
  itemById: Map<string, InventoryItem>
): RecipeIngredient[] {
  return targetRecipes.map((recipe) => {
    const item = itemById.get(recipe.inventory_item_id) ?? null;
    return {
      recipe,
      item,
      cost: Number(recipe.quantity) * Number(item?.cost_per_unit ?? 0),
    };
  });
}

export function buildProductRecipeSummary(
  menuItem: MenuItem,
  categoryName: string,
  recipes: InventoryRecipe[],
  itemById: Map<string, InventoryItem>
): ProductRecipeSummary {
  const productRecipes = recipes.filter((recipe) => recipe.menu_item_id === menuItem.id);
  const recipesByTarget = new Map<string, InventoryRecipe[]>();
  for (const recipe of productRecipes) {
    const key = recipeTargetKey(recipe.modifier_option_id);
    const current = recipesByTarget.get(key);
    if (current) current.push(recipe);
    else recipesByTarget.set(key, [recipe]);
  }

  const baseIngredients = ingredientRows(recipesByTarget.get("base") ?? [], itemById);
  const targets: RecipeTargetSummary[] = [
    {
      key: "base",
      label: "Producto base",
      description: "Se descuenta siempre que se vende este producto.",
      group: null,
      option: null,
      optionId: null,
      ingredients: baseIngredients,
      estimatedCost: baseIngredients.reduce((total, ingredient) => total + ingredient.cost, 0),
      configured: baseIngredients.length > 0,
      canEdit: true,
      orphaned: false,
    },
  ];
  const knownOptionIds = new Set<string>();

  for (const group of menuItem.modifiers) {
    for (const option of group.options) {
      const optionId = option.id ?? null;
      if (optionId) knownOptionIds.add(optionId);
      const matchingRecipes = optionId
        ? recipesByTarget.get(recipeTargetKey(optionId)) ?? []
        : productRecipes.filter(
            (recipe) =>
              recipe.modifier_option_id === null &&
              recipe.modifier_group_name === group.name &&
              recipe.modifier_option_name === option.name
          );
      const ingredients = ingredientRows(matchingRecipes, itemById);
      targets.push({
        key: optionId ? recipeTargetKey(optionId) : `legacy:${group.name}:${option.name}`,
        label: option.name,
        description: option.description || `Opción de ${group.name}.`,
        group,
        option,
        optionId,
        ingredients,
        estimatedCost: ingredients.reduce((total, ingredient) => total + ingredient.cost, 0),
        configured: ingredients.length > 0,
        canEdit: optionId !== null,
        orphaned: false,
      });
    }
  }

  const orphanedGroups = new Map<string, InventoryRecipe[]>();
  for (const recipe of productRecipes) {
    if (!recipe.modifier_option_id || knownOptionIds.has(recipe.modifier_option_id)) continue;
    const current = orphanedGroups.get(recipe.modifier_option_id);
    if (current) current.push(recipe);
    else orphanedGroups.set(recipe.modifier_option_id, [recipe]);
  }
  for (const [optionId, orphanedRecipes] of orphanedGroups) {
    const ingredients = ingredientRows(orphanedRecipes, itemById);
    const first = orphanedRecipes[0];
    targets.push({
      key: `orphan:${optionId}`,
      label: first.modifier_option_name || "Opción eliminada",
      description: `Revisar opción anterior de ${first.modifier_group_name || "este producto"}.`,
      group: null,
      option: null,
      optionId,
      ingredients,
      estimatedCost: ingredients.reduce((total, ingredient) => total + ingredient.cost, 0),
      configured: ingredients.length > 0,
      canEdit: false,
      orphaned: true,
    });
  }

  const currentTargets = targets.filter((target) => !target.orphaned);
  const configuredTargets = currentTargets.filter((target) => target.configured).length;
  const status: RecipeCoverageStatus = configuredTargets === 0
    ? "missing"
    : configuredTargets === currentTargets.length && orphanedGroups.size === 0
      ? "configured"
      : "partial";
  const ingredientNames = Array.from(
    new Set(
      (baseIngredients.length > 0
        ? baseIngredients
        : targets.flatMap((target) => target.ingredients)
      ).map((ingredient) => ingredient.item?.name ?? "Insumo no disponible")
    )
  ).slice(0, 3);

  return {
    menuItem,
    categoryName,
    status,
    targets,
    configuredTargets,
    totalTargets: currentTargets.length,
    estimatedBaseCost: targets[0].estimatedCost,
    ingredientNames,
    orphanedRecipeCount: Array.from(orphanedGroups.values()).reduce(
      (total, groupedRecipes) => total + groupedRecipes.length,
      0
    ),
  };
}

export function buildRecipeLibrary(
  menuItems: MenuItem[],
  categories: Category[],
  inventoryItems: InventoryItem[],
  recipes: InventoryRecipe[]
) {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const itemById = new Map(inventoryItems.map((item) => [item.id, item]));

  return menuItems
    .filter((menuItem) => menuItem.is_active)
    .map((menuItem) =>
      buildProductRecipeSummary(
        menuItem,
        categoryById.get(menuItem.category_id) ?? "Sin categoría",
        recipes,
        itemById
      )
    )
    .toSorted((a, b) =>
      a.categoryName.localeCompare(b.categoryName, "es-MX") ||
      a.menuItem.name.localeCompare(b.menuItem.name, "es-MX")
    );
}
