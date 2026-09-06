export const COMPACT_TABLE_PICKER_MAX_WIDTH = 1023;

export function shouldUseCompactTablePicker(viewportWidth: number) {
  return viewportWidth <= COMPACT_TABLE_PICKER_MAX_WIDTH;
}

export const COMPACT_TABLE_PICKER_MEDIA_QUERY =
  `(max-width: ${COMPACT_TABLE_PICKER_MAX_WIDTH}px)`;
