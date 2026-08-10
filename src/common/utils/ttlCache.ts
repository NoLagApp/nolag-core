/**
 * Generic TTL Cache
 *
 * Simple in-memory cache with time-to-live expiration. Swept lazily every N
 * writes rather than on a timer, so an idle process does no work.
 *
 * Not shared between instances. Anything cached here is therefore stale for at
 * most the TTL on any single instance, which is the bound to reason about when
 * caching an authorization decision.
 */
export class TtlCache<V> {
  private readonly _cache = new Map<string, { value: V; expiresAt: number }>();
  private _writesSinceLastSweep = 0;
  private static readonly _SWEEP_INTERVAL = 100;

  constructor(private readonly _ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this._cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: V): void {
    this._cache.set(key, {
      value,
      expiresAt: Date.now() + this._ttlMs,
    });
    if (++this._writesSinceLastSweep >= TtlCache._SWEEP_INTERVAL) {
      this._writesSinceLastSweep = 0;
      this._sweep();
    }
  }

  private _sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this._cache) {
      if (now > entry.expiresAt) {
        this._cache.delete(key);
      }
    }
  }

  delete(key: string): void {
    this._cache.delete(key);
  }

  clear(): void {
    this._cache.clear();
  }
}
