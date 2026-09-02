/**
 * A small in-process cache with a time-to-live.
 *
 * Six hand-rolled copies of this existed (dashboard stats, widget config, FAQs, social
 * search, web research, tracked URLs), each with its own expiry check and its own idea
 * of when to evict. They were all the same twelve lines with different variable names.
 *
 * Deliberately per-process and unbounded-until-swept: these caches exist to collapse a
 * burst of identical requests, not to be a source of truth. Anything that must survive
 * a restart or be shared between instances belongs in Postgres.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; at: number }>();

  constructor(
    private readonly ttlMs: number,
    /** Sweep expired entries once the map grows past this. */
    private readonly maxEntries = 500
  ) {}

  get(key: string): V | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.entries.set(key, { value, at: Date.now() });
    if (this.entries.size > this.maxEntries) this.sweep();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.entries) {
      if (now - v.at > this.ttlMs) this.entries.delete(k);
    }
  }
}
