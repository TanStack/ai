import type { MemoryHit, MemoryQuery, MemoryRecord, MemoryScope } from './types'

const DEFAULT_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

/**
 * Decide whether a record's scope satisfies a query scope.
 *
 * **Strict-by-default empty-scope semantics.** When `queryScope` has no
 * defined keys (every key is `undefined`/null, or the object is `{}`), this
 * returns `false` — i.e. an empty query scope matches NOTHING. This is a
 * deliberate cross-tenant safety guard: callers like `clear({})` or
 * `search({ scope: {}, ... })` would otherwise wipe / leak every tenant's
 * records. Adapters that want to operate on a specific scope key (e.g. all
 * records for a tenant regardless of user) must pass that key explicitly,
 * e.g. `{ tenantId: 't1' }`.
 */
export function scopeMatches(
  recordScope: MemoryScope,
  queryScope: MemoryScope,
): boolean {
  let definedKeys = 0
  for (const key of Object.keys(queryScope) as Array<keyof MemoryScope>) {
    const value = queryScope[key]
    if (value == null) continue
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

export function recencyScore(
  createdAt: number,
  halfLifeMs: number = DEFAULT_HALF_LIFE_MS,
): number {
  const age = Math.max(0, Date.now() - createdAt)
  return Math.pow(0.5, age / halfLifeMs)
}

export function isExpired(
  record: MemoryRecord,
  now: number = Date.now(),
): boolean {
  return record.expiresAt !== undefined && record.expiresAt < now
}

export function defaultScoreHit(args: {
  record: MemoryRecord
  query: MemoryQuery
  now?: number
}): number {
  const { record, query } = args
  const semantic = cosine(query.embedding, record.embedding)
  const lexical = lexicalOverlap(query.text, record.text)
  const recency = recencyScore(record.createdAt)
  const importance = record.importance ?? 0.5
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
    ...hits.map(
      (hit, index) => `${index + 1}. [${hit.record.kind}] ${hit.record.text}`,
    ),
  ].join('\n')
}
