export function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhoneForDisplay(value: string) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "Sin teléfono";
  if (/^(?:52|521)\d{10}$/.test(digits)) {
    const local = digits.slice(-10);
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return digits.length === 10
    ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    : `+${digits}`;
}
