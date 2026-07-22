/**
 * Shared internals for the built-in `inMemory()` and `redis()` adapters.
 *
 * NOT part of the public contract — nothing here is exported from the package
 * root. Both built-in adapters keep a set of scored, optionally-embedded
 * `MemoryRecord`s and expose only `recall`/`save`; this module holds the record
 * model, the scoring/rendering helpers, and the extract→store→score→render
 * pipeline they share. The only thing an adapter supplies is a {@link RecordStore}
 * (a Map for in-memory, Redis keys for redis).
 */

import type {
  MemoryFact,
  MemoryFragment,
  MemoryScope,
  MemorySnapshot,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '../types'

export type MemoryKind = 'message' | 'summary' | 'fact' | 'preference'
export type MemoryRole = 'user' | 'assistant'

/** Internal stored record. Never crosses the public boundary. */
export interface MemoryRecord {
  id: string
  scope: MemoryScope
  text: string
  kind: MemoryKind
  role?: MemoryRole
  createdAt: number
  updatedAt?: number
  expiresAt?: number
  importance?: number
  embedding?: Array<number>
  metadata?: Record<string, unknown>
}

/** Pluggable extractor: turn a completed turn into extra records to persist. */
export type ExtractFn = (
  turn: MemoryTurn,
  scope: MemoryScope,
) =>
  | Promise<Array<ExtractedFact> | undefined>
  | Array<ExtractedFact>
  | undefined

export interface ExtractedFact {
  text: string
  kind?: MemoryKind
  importance?: number
  metadata?: Record<string, unknown>
}

export interface Embedder {
  embed: (text: string) => Promise<Array<number>>
}

/** Options common to the built-in adapters. */
export interface BuiltinOptions {
  /** Max hits returned by recall. Defaults to 6. */
  topK?: number
  /** Drop hits scoring below this. Defaults to 0.15. */
  minScore?: number
  /** Restrict recall to these kinds. Defaults to all. */
  kinds?: Array<MemoryKind>
  /** Optional embedder for semantic scoring on both save and recall. */
  embedder?: Embedder
  /** Optional extractor run on `save` to persist derived facts/preferences. */
  extract?: ExtractFn
  /** Replace the built-in prompt renderer. */
  render?: (hits: Array<MemoryHit>) => string
}

export interface MemoryHit {
  record: MemoryRecord
  score: number
}

/**
 * Minimal storage backend the built-in adapters run on. `add` upserts by id;
 * `loadScope` returns the live (non-expired) records for exactly this scope.
 */
export interface RecordStore {
  add: (records: Array<MemoryRecord>) => Promise<void>
  loadScope: (scope: MemoryScope) => Promise<Array<MemoryRecord>>
}

// ===========================
// Scope
// ===========================

/**
 * Exact scope match. In the recall/save model the scope is always fully
 * specified at both write and read (same middleware, same resolver), so a
 * record is in-scope iff its `sessionId` matches and — when the query carries a
 * `userId` — its `userId` matches too.
 */
export function sameScope(record: MemoryScope, query: MemoryScope): boolean {
  if (record.sessionId !== query.sessionId) return false
  if (query.userId != null && query.userId !== '') {
    return record.userId === query.userId
  }
  return true
}

// ===========================
// Scoring helpers
// ===========================

const DEFAULT_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

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
 * Reference ranking: weighted sum of semantic (0.55), lexical (0.20), recency
 * (0.15), and importance (0.10). Unset importance contributes 0 — no mid-range
 * fallback, so recent records don't automatically clear the `minScore` floor.
 */
export function defaultScoreHit(args: {
  record: MemoryRecord
  queryText: string
  queryEmbedding?: Array<number>
  now?: number
}): number {
  const { record, queryText, queryEmbedding, now } = args
  const semantic = cosine(queryEmbedding, record.embedding)
  const lexical = lexicalOverlap(queryText, record.text)
  const recency = recencyScore(record.createdAt, undefined, now)
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
    // JSON.stringify the text so persisted content with newlines or
    // instruction-shaped text can't break out of the list and steer the turn.
    ...hits.map(
      (hit, index) =>
        `${index + 1}. [${hit.record.kind}] ${JSON.stringify(hit.record.text)}`,
    ),
  ].join('\n')
}

// ===========================
// Shared recall / save pipeline
// ===========================

/** Portable record id — real UUID where available, deterministic fallback otherwise. */
export function newRecordId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * Build the records for a completed turn: the raw user/assistant messages
 * (importance 0.4) plus anything the optional extractor returns, embedding each
 * when an embedder is configured.
 */
export async function buildTurnRecords(
  scope: MemoryScope,
  turn: MemoryTurn,
  options: BuiltinOptions,
): Promise<Array<MemoryRecord>> {
  const now = Date.now()
  const records: Array<MemoryRecord> = []

  async function embed(text: string): Promise<Array<number> | undefined> {
    if (!options.embedder) return undefined
    return options.embedder.embed(text)
  }

  if (turn.user) {
    records.push({
      id: newRecordId(),
      scope,
      text: turn.user,
      kind: 'message',
      role: 'user',
      createdAt: now,
      importance: 0.4,
      embedding: await embed(turn.user),
    })
  }
  if (turn.assistant) {
    records.push({
      id: newRecordId(),
      scope,
      text: turn.assistant,
      kind: 'message',
      role: 'assistant',
      createdAt: now,
      importance: 0.4,
      embedding: await embed(turn.assistant),
    })
  }

  const extracted = await options.extract?.(turn, scope)
  if (extracted) {
    for (const fact of extracted) {
      records.push({
        id: newRecordId(),
        scope,
        text: fact.text,
        kind: fact.kind ?? 'fact',
        createdAt: now,
        importance: fact.importance,
        embedding: await embed(fact.text),
        metadata: fact.metadata,
      })
    }
  }
  return records
}

/** Persist a turn to the store and return one receipt for the batch. */
export async function saveTurn(
  store: RecordStore,
  scope: MemoryScope,
  turn: MemoryTurn,
  options: BuiltinOptions,
): Promise<Array<SaveReceipt>> {
  const startedAt = Date.now()
  try {
    const records = await buildTurnRecords(scope, turn, options)
    if (records.length > 0) await store.add(records)
    return [
      {
        ok: true,
        latencyMs: Date.now() - startedAt,
        raw: { addedIds: records.map((r) => r.id) },
      },
    ]
  } catch (error) {
    return [
      {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

/** Score the scoped records against the query and render a recall result. */
export async function recallRecords(
  store: RecordStore,
  scope: MemoryScope,
  query: string,
  options: BuiltinOptions,
): Promise<RecallResult> {
  const topK = options.topK ?? 6
  const minScore = options.minScore ?? 0.15
  const now = Date.now()

  const queryEmbedding = options.embedder
    ? await options.embedder.embed(query)
    : undefined

  const records = await store.loadScope(scope)
  const kinds = options.kinds
  const candidates =
    kinds && kinds.length > 0
      ? records.filter((r) => kinds.includes(r.kind))
      : records

  const hits = candidates
    .map((record) => ({
      record,
      score: defaultScoreHit({ record, queryText: query, queryEmbedding, now }),
    }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  const systemPrompt = (options.render ?? defaultRenderMemory)(hits)
  const fragments: Array<MemoryFragment> = hits.map((h) => ({
    text: h.record.text,
    source: h.record.id,
  }))
  return { systemPrompt, fragments }
}

/** Devtools inspect over a scope's live records. */
export async function inspectRecords(
  store: RecordStore,
  scope: MemoryScope,
): Promise<MemorySnapshot> {
  const records = await store.loadScope(scope)
  return {
    takenAt: new Date().toISOString(),
    data: {
      records: records.map((r) => ({
        id: r.id,
        text: r.text,
        kind: r.kind,
        role: r.role,
        createdAt: r.createdAt,
        importance: r.importance,
      })),
    },
  }
}

/** Devtools flat fact list over a scope's live records. */
export async function listRecordFacts(
  store: RecordStore,
  scope: MemoryScope,
): Promise<Array<MemoryFact>> {
  const records = await store.loadScope(scope)
  return records.map((r) => ({
    id: r.id,
    text: r.text,
    source: r.role ?? r.kind,
    createdAt: new Date(r.createdAt).toISOString(),
  }))
}
