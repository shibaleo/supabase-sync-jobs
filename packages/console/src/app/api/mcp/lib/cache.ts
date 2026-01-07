// packages/console/src/app/api/mcp/lib/cache.ts

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const schemaCache = new MemoryCache();

// TTL 定義
export const CACHE_TTL = {
  SCHEMA: 24 * 60 * 60 * 1000, // 24時間
  USER_SETTINGS: 5 * 60 * 1000, // 5分
} as const;
