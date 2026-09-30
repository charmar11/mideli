export function toggleComboOptionSelection(
  selected: Record<string, string>,
  groupId: string,
  optionId: string,
): Record<string, string> {
  const next = { ...selected };

  if (next[groupId] === optionId) {
    delete next[groupId];
  } else {
    next[groupId] = optionId;
  }

  return next;
}
