/**
 * Reutiliza los objetos de pedidos que no cambiaron entre dos recargas.
 *
 * Cada recarga de pedidos activos crea objetos nuevos aunque los datos sean
 * idénticos. Para React eso significa "todo cambió" y redibuja Mesero, Estado
 * y Cocina completos. Conservar la misma referencia cuando el contenido es
 * igual permite que solo se redibuje lo que de verdad cambió.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Igualdad profunda para datos planos (JSON): objetos, arreglos y primitivos. */
export function isDeepEqualData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!isDeepEqualData(a[index], b[index])) return false;
    }
    return true;
  }

  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!isDeepEqualData(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Devuelve `next`, pero reutilizando cada pedido de `previous` con el mismo
 * id y contenido idéntico. Si la lista completa es igual (mismos pedidos, en
 * el mismo orden y sin cambios), devuelve exactamente el arreglo `previous`.
 */
export function reconcileOrderList<T extends { id: string }>(
  previous: readonly T[],
  next: readonly T[],
): T[] {
  if (previous.length === 0) {
    return next.length === 0 ? (previous as T[]) : (next as T[]);
  }

  const previousById = new Map<string, T>();
  for (const order of previous) previousById.set(order.id, order);

  let unchanged = previous.length === next.length;
  const reconciled = next.map((order, index) => {
    const previousOrder = previousById.get(order.id);
    if (previousOrder && isDeepEqualData(previousOrder, order)) {
      if (previous[index] !== previousOrder) unchanged = false;
      return previousOrder;
    }
    unchanged = false;
    return order;
  });

  return unchanged ? (previous as T[]) : reconciled;
}
