export function getDeliveryWarningReviewLabel(
  needsLocation: boolean,
  needsPhone: boolean,
) {
  if (needsLocation && needsPhone) return "Revisar domicilio y teléfono";
  if (needsPhone) return "Revisar teléfono";
  return "Revisar domicilio";
}
