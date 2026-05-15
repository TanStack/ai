import type { MemoryHit, MemoryQuery, MemoryRecord, MemoryScope } from './types'

const DEFAULT_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

/**
 * Decide whether a record's scope satisfies a query scope.
 *
 * **Strict-by-default empty-scope semantics.** When `queryScope` has no
 * defined keys (every key is `undefined`/null, the empty string, or the
 * object is `{}`), this returns `false` — i.e. an empty query scope matches
 * NOTHING. This is a deliberate cross-tenant safety guard: callers like
 * `clear({})` or `search({ scope: {}, ... })` would otherwise wipe / leak
 * every tenant's records. Adapters that want to operate on a specific scope
 * key (e.g. all records for a tenant regardless of user) must pass that key
 * explicitly, e.g. `{ tenantId: 't1' }`.
 *
 * **Empty-string scope values are treated as undefined.** Scope values MUST
 * be non-empty strings to be meaningful. A query of `{ tenantId: '' }` is
 * equivalent to `{}` and matches nothing — this prevents callers from
 * accidentally producing a degenerate "blank-tenant" bucket that would be
 * unreachable from any normal query and indistinguishable from records whose
 * scope key was simply unset.
 */
export function scopeMatches(
  recordScope: MemoryScope,
  queryScope: MemoryScope,
): boolean {
  let definedKeys = 0
  for (const key of Object.keys(queryScope) as Array<keyof MemoryScope>) {
    const value = queryScope[key]
    if (value == null) continue
    // Empty strings are treated as undefined — they cannot be a defined
    // scope value. Mirrored in adapters' `hasAnyScopeKey` guards so the same
    // rule applies at every isolation boundary.
    if (typeof value === 'string' && value.length === 0) continue
    definedKeys++
    if (recordScope[key] !== value) return false
  }
  if (definedKeys === 0) return false
  return true
}

export function cosine(a?: Array<number>, b?: Array<number>): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let aMag = 0
  let bMag = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] as number
    const bv = b[i] as number
    dot += av * bv
    aMag += av ** 2
    bMag += bv ** 2
  }
  if (aMag === 0 || bMag === 0) return 0
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag))
}

export function lexicalOverlap(query: string, text: string): number {
  const queryTokens = new Set(query.toLowerCase().split(/\W+/).filter(Boolean))
  if (queryTokens.size === 0) return 0
  const textTokens = new Set(text.toLowerCase().split(/\W+/).filter(Boolean))
  let overlap = 0
  for (const token of queryTokens) {
    if (textTokens.has(token)) overlap++
  }
  return overlap / queryTokens.size
}

/**
 * Exponential decay score over record age.
 *
 * @param createdAt  Record creation timestamp (epoch ms).
 * @param halfLifeMs Time (ms) at which the score reaches 0.5. Defaults to 30 days.
 * @param now        Reference "current" time (epoch ms). Defaults to `Date.now()`.
 *                   Callers MAY pass an explicit `now` to make scoring deterministic
 *                   (e.g. in tests or batch re-scoring jobs).
 */
export function recencyScore(
  createdAt: number,
  halfLifeMs: number = DEFAULT_HALF_LIFE_MS,
  now: number = Date.now(),
): number {
  const age = Math.max(0, now - createdAt)
  return Math.pow(0.5, age / halfLifeMs)
}

export function isExpired(
  record: MemoryRecord,
  now: number = Date.now(),
): boolean {
  return record.expiresAt !== undefined && record.expiresAt < now
}

/**
 * Reference ranking function used by adapters that want a sensible default.
 *
 * Weighted sum of four signals, each in `[0, 1]`:
 *   - semantic similarity (cosine) — 0.55
 *   - lexical overlap              — 0.20
 *   - recency (exp decay)          — 0.15
 *   - importance                   — 0.10
 *
 * Importance is read from `record.importance`. **If unset, importance
 * contributes 0** — the function deliberately does NOT fall back to a
 * mid-range default. With the `MemoryMiddlewareOptions.minScore` floor at
 * `0.15`, a non-zero importance default would push every recent record over
 * the floor regardless of relevance. Callers who want recent records to
 * float MUST set `importance` on the record explicitly.
 *
 * @param args.now Optional reference "current" time (epoch ms) threaded
 *                 through to `recencyScore` so callers can score
 *                 deterministically. Defaults to `Date.now()`.
 */
export function defaultScoreHit(args: {
  record: MemoryRecord
  query: MemoryQuery
  now?: number
}): number {
  const { record, query, now } = args
  const semantic = cosine(query.embedding, record.embedding)
  const lexical = lexicalOverlap(query.text, record.text)
  const recency = recencyScore(record.createdAt, undefined, now)
  // No default fallback for importance — unset means "no importance signal",
  // which contributes 0 to the score. See JSDoc above for rationale.
  const importance = record.importance ?? 0
  return semantic * 0.55 + lexical * 0.2 + recency * 0.15 + importance * 0.1
}

export function defaultRenderMemory(hits: Array<MemoryHit>): string {
  if (hits.length === 0) return ''
  return [
    'Relevant memory:',
    'Use this information only when it is relevant to the current user request.',
    'Do not mention memory directly unless the user asks about it.',
    'If current conversation context contradicts memory, prefer the current conversation.',
    '',
    // JSON.stringify the record text so persisted memory containing newlines
    // or instruction-shaped content cannot break out of the list structure
    // and steer subsequent turns at system priority. The double-quoted form
    // also makes the content visibly data-shaped rather than instruction-shaped.
    ...hits.map(
      (hit, index) =>
        `${index + 1}. [${hit.record.kind}] ${JSON.stringify(hit.record.text)}`,
    ),
  ].join('\n')
}
