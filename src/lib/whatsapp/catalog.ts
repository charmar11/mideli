import type { MenuItem } from "@/types/database";
import { includesPhrase, normalizeText, quantityFromText } from "./normalize";
import type {
  CatalogProductMatch,
  ConversationCatalog,
  ConversationCatalogItem,
  ConversationModifier,
} from "./types";

export function buildConversationCatalog(menuItems: MenuItem[]): ConversationCatalog {
  return {
    items: menuItems
      .filter((item) => item.is_active)
      .map((item) => ({
        id: item.id,
        name: item.name,
        normalizedName: normalizeText(item.name),
        price: Number(item.price),
        modifiers: item.modifiers ?? [],
      }))
      .sort((left, right) => right.normalizedName.length - left.normalizedName.length),
  };
}

function phraseIndexes(text: string, phrase: string) {
  const indexes: number[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(phrase, cursor);
    if (index < 0) break;
    const before = index === 0 ? " " : text[index - 1];
    const afterIndex = index + phrase.length;
    const after = afterIndex >= text.length ? " " : text[afterIndex];
    if (before === " " && after === " ") indexes.push(index);
    cursor = index + phrase.length;
  }
  return indexes;
}

function singularWord(value: string) {
  return value.length > 4 && value.endsWith("s") ? value.slice(0, -1) : value;
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1] +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function fuzzyProductCandidates(text: string, catalog: ConversationCatalog) {
  const tokens = Array.from(text.matchAll(/\S+/g)).map((match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));

  return catalog.items.flatMap((item) => {
    const itemWords = item.normalizedName.split(" ");
    if (item.normalizedName.length < 5 || tokens.length < itemWords.length) return [];
    const target = itemWords.map(singularWord).join(" ");
    const maximumDistance = Math.min(2, Math.max(1, Math.floor(target.length * 0.2)));
    const matches: Array<{ item: ConversationCatalogItem; start: number; end: number }> = [];

    for (let index = 0; index <= tokens.length - itemWords.length; index += 1) {
      const window = tokens.slice(index, index + itemWords.length);
      const candidate = window.map((token) => singularWord(token.value)).join(" ");
      if (candidate[0] !== target[0]) continue;
      if (editDistance(candidate, target) <= maximumDistance) {
        matches.push({
          item,
          start: window[0].start,
          end: window[window.length - 1].end,
        });
      }
    }
    return matches;
  });
}

export function findCatalogProducts(
  message: string,
  catalog: ConversationCatalog
): CatalogProductMatch[] {
  const text = normalizeText(message);
  const candidates = catalog.items.flatMap((item) =>
    phraseIndexes(text, item.normalizedName).map((start) => ({
      item,
      start,
      end: start + item.normalizedName.length,
    }))
  );
  for (const fuzzy of fuzzyProductCandidates(text, catalog)) {
    if (
      !candidates.some(
        (candidate) =>
          candidate.item.id === fuzzy.item.id && candidate.start === fuzzy.start
      )
    ) {
      candidates.push(fuzzy);
    }
  }

  candidates.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return right.item.normalizedName.length - left.item.normalizedName.length;
  });

  const nonOverlapping = candidates.filter((candidate, index, list) =>
    !list.some(
      (other, otherIndex) =>
        otherIndex < index &&
        candidate.start < other.end &&
        candidate.end > other.start
    )
  );

  return nonOverlapping.map((candidate, index) => {
    const previousEnd = index === 0 ? 0 : nonOverlapping[index - 1].end;
    const nextStart = nonOverlapping[index + 1]?.start ?? text.length;
    const quantityContext = text.slice(previousEnd, candidate.start);
    return {
      ...candidate,
      quantity: quantityFromText(quantityContext),
      segment: text.slice(candidate.start, nextStart),
    };
  });
}

function optionMatches(segment: string, optionName: string) {
  const normalizedOption = normalizeText(optionName);
  if (includesPhrase(segment, normalizedOption)) return true;
  const numericPrefix = normalizedOption.match(/^\d+/)?.[0];
  return numericPrefix ? includesPhrase(segment, numericPrefix) : false;
}

export function matchItemModifiers(
  item: ConversationCatalogItem,
  message: string
): ConversationModifier[] {
  const segment = normalizeText(message);
  return item.modifiers.flatMap((group, groupIndex) => {
    const matchingOptions = group.options.filter((option) =>
      optionMatches(segment, option.name)
    );
    const selectionMode = group.selection_mode ?? "single";
    const maximum =
      selectionMode === "single"
        ? 1
        : Math.max(0, group.max_selections ?? matchingOptions.length);

    return matchingOptions.slice(0, maximum).map((option, optionIndex) => ({
      groupId: group.id ?? `group-${groupIndex}`,
      groupName: group.name,
      optionId: option.id ?? `option-${groupIndex}-${optionIndex}`,
      optionName: option.name,
      price: Number(option.price),
    }));
  });
}

export function missingRequiredGroups(
  item: ConversationCatalogItem,
  selected: ConversationModifier[]
) {
  return item.modifiers.filter((group, groupIndex) => {
    const minimum = group.required ? Math.max(1, group.min_selections ?? 1) : group.min_selections ?? 0;
    if (minimum === 0) return false;
    const groupId = group.id ?? `group-${groupIndex}`;
    return selected.filter((modifier) => modifier.groupId === groupId).length < minimum;
  });
}
