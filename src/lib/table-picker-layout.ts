// Tablet landscape widths still need the compact picker. The desktop layout
// requires enough room for both the map and the confirmation panel.
export const COMPACT_TABLE_PICKER_MAX_WIDTH = 1279;

export function shouldUseCompactTablePicker(viewportWidth: number) {
  return viewportWidth <= COMPACT_TABLE_PICKER_MAX_WIDTH;
}

export const COMPACT_TABLE_PICKER_MEDIA_QUERY =
  `(max-width: ${COMPACT_TABLE_PICKER_MAX_WIDTH}px)`;
