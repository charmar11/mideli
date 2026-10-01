export const BUSINESS_CATALOG_CACHE_MS = 30_000;
const MAX_CACHED_BUSINESSES = 12;

interface CatalogSnapshot {
  categories: unknown[];
  menuItems: unknown[];
  fetchedAt: number;
}

const cache = new Map<string, CatalogSnapshot>();

export function cacheBusinessCatalog<TCategory, TMenuItem>(
  businessId: string,
  catalog: { categories: TCategory[]; menuItems: TMenuItem[] },
  now = Date.now(),
) {
  cache.set(businessId, {
    categories: [...catalog.categories],
    menuItems: [...catalog.menuItems],
    fetchedAt: now,
  });

  for (const [cachedBusinessId, snapshot] of cache) {
    if (now - snapshot.fetchedAt >= BUSINESS_CATALOG_CACHE_MS) {
      cache.delete(cachedBusinessId);
    }
  }

  while (cache.size > MAX_CACHED_BUSINESSES) {
    const oldestBusinessId = cache.keys().next().value;
    if (!oldestBusinessId) break;
    cache.delete(oldestBusinessId);
  }
}

export function readBusinessCatalog<TCategory, TMenuItem>(
  businessId: string,
  now = Date.now(),
): { categories: TCategory[]; menuItems: TMenuItem[] } | null {
  const snapshot = cache.get(businessId);
  if (!snapshot) return null;
  if (now - snapshot.fetchedAt >= BUSINESS_CATALOG_CACHE_MS) {
    cache.delete(businessId);
    return null;
  }

  // Refresh insertion order so the least-recently-used catalog is evicted first.
  cache.delete(businessId);
  cache.set(businessId, snapshot);
  return {
    categories: [...snapshot.categories] as TCategory[],
    menuItems: [...snapshot.menuItems] as TMenuItem[],
  };
}

export function clearBusinessCatalogCache(businessId?: string) {
  if (businessId) {
    cache.delete(businessId);
    return;
  }
  cache.clear();
}
