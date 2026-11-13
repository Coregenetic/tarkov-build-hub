/**
 * Einfaches Rate-Limit im Speicher (feste Zeitfenster je Schlüssel).
 * Reicht für eine einzelne Instanz; bei mehreren Instanzen auf die Datenbank umstellen.
 */
export interface RateLimiter {
  /** true = erlaubt, false = Limit erreicht. */
  hit(key: string, now?: number): boolean;
}

export function createRateLimiter(options: { windowMs: number; max: number; maxKeys?: number }): RateLimiter {
  const buckets = new Map<string, { start: number; count: number }>();
  const maxKeys = options.maxKeys ?? 10_000;
  return {
    hit(key, now = Date.now()) {
      const bucket = buckets.get(key);
      if (!bucket || now - bucket.start >= options.windowMs) {
        if (buckets.size >= maxKeys) {
          for (const [k, b] of buckets) if (now - b.start >= options.windowMs) buckets.delete(k);
          if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value as string);
        }
        buckets.set(key, { start: now, count: 1 });
        return true;
      }
      bucket.count++;
      return bucket.count <= options.max;
    },
  };
}
