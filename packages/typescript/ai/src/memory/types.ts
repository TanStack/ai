/**
 * Memory subsystem type definitions.
 *
 * This module defines the public contract for the memory adapter ecosystem:
 * the storage-shaped {@link MemoryAdapter} interface, the record/query/op shapes
 * adapters operate on, and the {@link MemoryMiddlewareOptions} surface used to
 * wire memory into a chat run via the memory middleware.
 *
 * The architectural split is intentional:
 * - **Adapters are thin storage.** They persist, fetch, search, and scope-filter
 *   records. They do not decide what to remember, when to retrieve, or how to
 *   render hits into a prompt.
 * - **Policy lives in the middleware.** Decisions like "should we retrieve here?",
 *   "what facts should we extract from this turn?", or "how do we render hits
 *   into a system prompt?" are configured on the middleware, not the adapter.
 *
 * Third-party adapter implementers should treat this file as the source of truth
 * for the contract. Method-level semantics (upsert behaviour, scope isolation,
 * expiry filtering, error vs. no-op for unknown ids) are documented on each
 * member of {@link MemoryAdapter} below.
 */

import type { ChatMiddlewareContext } from '../activities/chat/middleware/types'

// ===========================
// Scope & primitives
// ===========================

/**
 * Multi-dimensional scope used to isolate memory records across tenants,
 * users, sessions, threads, and arbitrary namespaces.
 *
 * Each key is optional and orthogonal:
 * - `tenantId` — top-level organisation / workspace boundary in multi-tenant apps.
 * - `userId` — end-user identity within a tenant.
 * - `sessionId` — short-lived session (e.g. browser session, anonymous visitor).
 * - `threadId` — conversation / thread identifier within a session.
 * - `namespace` — application-defined bucket (e.g. `'preferences'`, `'kb'`).
 *
 * Adapters MUST treat scope as a strict isolation boundary: a `get`/`search`/
 * `list`/`update`/`delete` call against scope `A` MUST NOT return, mutate, or
 * remove records that belong to a different scope `B`. Cross-contamination
 * between scopes is a correctness bug, especially for multi-tenant deployments.
 */
export type MemoryScope = {
  tenantId?: string
  userId?: string
  sessionId?: string
  threadId?: string
  namespace?: string
}

/**
 * Classification of a stored memory record.
 *
 * - `'message'` — a raw conversation turn (user or assistant utterance) captured verbatim.
 * - `'summary'` — a compressed summary of prior conversation history, used to keep
 *   long threads within context windows.
 * - `'fact'` — an extracted statement of fact about the user or world
 *   (e.g. "user lives in Berlin").
 * - `'preference'` — an extracted user preference (e.g. "prefers concise answers").
 * - `'tool-result'` — a persisted tool execution result, kept for future recall
 *   (e.g. cached search results, expensive computations).
 *
 * Middleware can filter retrieval by `kinds` to scope what gets surfaced into
 * a given prompt (for example, retrieve only `'fact'` and `'preference'` for
 * persona injection, or only `'tool-result'` for cache-style recall).
 */
export type MemoryKind =
  | 'message'
  | 'summary'
  | 'fact'
  | 'preference'
  | 'tool-result'

/**
 * Role attached to a memory record when it represents a conversation turn.
 * Mirrors the standard chat role taxonomy.
 */
export type MemoryRole = 'user' | 'assistant' | 'system' | 'tool'

// ===========================
// Records
// ===========================

/**
 * A single memory record persisted by an adapter.
 */
export type MemoryRecord = {
  /**
   * Globally unique identifier within the adapter. The adapter owns id-space
   * uniqueness across all scopes — two records with the same `id` MUST NOT
   * coexist in the adapter, regardless of scope.
   */
  id: string
  /** Scope this record belongs to. Used by adapters for isolation. */
  scope: MemoryScope
  /** Human-readable text content of the memory. Indexed for search. */
  text: string
  /** Classification — see {@link MemoryKind}. */
  kind: MemoryKind
  /** Optional originating role when this record represents a chat turn. */
  role?: MemoryRole
  /** Creation timestamp in epoch milliseconds. Set by the adapter on `add` if absent. */
  createdAt: number
  /**
   * Last update timestamp in epoch milliseconds. Bumped automatically by the
   * adapter on `update`. Equal to `createdAt` for never-updated records.
   */
  updatedAt?: number
  /**
   * Optional epoch-ms expiration. Adapters MUST filter expired records out of
   * `search`/`list`/`get` and SHOULD opportunistically remove them on `add`.
   */
  expiresAt?: number
  /**
   * Importance hint in the range `0..1` (higher = more important). This is a
   * soft signal a re-ranker, eviction policy, or summariser may consult — it
   * is not enforced by the adapter contract.
   */
  importance?: number
  /**
   * Optional precomputed embedding vector. Length is consumer-defined (model-
   * dependent) — the adapter does not validate dimensionality, but all records
   * within a single adapter deployment SHOULD share a consistent dimension if
   * vector search is used.
   */
  embedding?: number[]
  /** Free-form metadata bag for adapter-specific or app-specific annotations. */
  metadata?: Record<string, unknown>
}

/**
 * Patch shape for in-place updates.
 *
 * `id`, `scope`, and `createdAt` are immutable and cannot be patched. The
 * adapter preserves `createdAt` and bumps `updatedAt` automatically on every
 * successful `update` call — callers SHOULD NOT set `updatedAt` themselves.
 */
export type MemoryRecordPatch = Partial<
  Omit<MemoryRecord, 'id' | 'scope' | 'createdAt'>
>

/**
 * A single search result: the matched record plus the relevance score the
 * adapter assigned. Score semantics (cosine, BM25, hybrid, etc.) are
 * adapter-defined; consumers should treat scores as relative within a single
 * search result set, not as absolute values across adapters.
 */
export type MemoryHit = { record: MemoryRecord; score: number }

// ===========================
// Queries
// ===========================

/**
 * Relevance-ranked search query passed to {@link MemoryAdapter.search}.
 */
export type MemoryQuery = {
  /** Scope to search within. Records outside this scope MUST NOT be returned. */
  scope: MemoryScope
  /** Query text used by the adapter for ranking (lexical, semantic, or hybrid). */
  text: string
  /** Optional precomputed query embedding. If provided, the adapter MAY use it instead of embedding `text`. */
  embedding?: number[]
  /** Maximum number of hits to return. */
  topK?: number
  /** Drop hits with `score < minScore`. */
  minScore?: number
  /** Restrict matches to the given record kinds. */
  kinds?: MemoryKind[]
  /**
   * Opaque pagination cursor returned from a previous `search` call. The
   * cursor format is adapter-defined and MUST NOT be parsed by callers.
   */
  cursor?: string
}

/**
 * Result of a {@link MemoryAdapter.search} call.
 */
export type MemorySearchResult = {
  /** Hits ordered by descending relevance. */
  hits: MemoryHit[]
  /** Opaque cursor for fetching the next page, or `undefined` if no more results. */
  nextCursor?: string
}

/**
 * Options for non-relevance browsing via {@link MemoryAdapter.list}.
 */
export type MemoryListOptions = {
  /** Restrict to the given record kinds. */
  kinds?: MemoryKind[]
  /** Maximum number of records to return. */
  limit?: number
  /** Opaque pagination cursor returned from a previous `list` call. */
  cursor?: string
  /** Sort order. Defaults are adapter-defined when omitted. */
  order?: 'createdAt:desc' | 'createdAt:asc' | 'updatedAt:desc'
}

/**
 * Result of a {@link MemoryAdapter.list} call.
 */
export type MemoryListResult = {
  /** Records ordered per `MemoryListOptions.order`. */
  items: MemoryRecord[]
  /** Opaque cursor for fetching the next page, or `undefined` if no more records. */
  nextCursor?: string
}

// ===========================
// Adapter contract
// ===========================

/**
 * Storage-shaped contract every memory backend implements.
 *
 * **Design principle: thin storage; policy lives in the middleware.** Adapters
 * are responsible for persistence, retrieval, scope isolation, and expiry
 * filtering — nothing else. Decisions about what to remember, when to retrieve,
 * how to rank, or how to render hits into a prompt belong on
 * {@link MemoryMiddlewareOptions}, not on the adapter.
 *
 * Cross-cutting invariants every adapter MUST uphold:
 * - **Scope isolation.** No method may return, mutate, or delete records that
 *   live outside the supplied scope. See {@link MemoryScope}.
 * - **Expiry filtering.** Records whose `expiresAt` has passed MUST be filtered
 *   out of `search`, `list`, and `get`. Adapters SHOULD opportunistically remove
 *   them on `add`.
 * - **Id uniqueness.** Ids are globally unique within the adapter, across all scopes.
 */
export interface MemoryAdapter {
  /** Stable adapter name (used for logging, devtools, and diagnostics). */
  name: string

  /**
   * Upsert one or more records by id.
   *
   * `add` is **upsert-by-id**, not insert-only: if a record with the same `id`
   * already exists, it is replaced. The single-record form
   * (`add(record)`) and the array form (`add([record, ...])`) behave
   * identically — passing a single record is exactly equivalent to passing a
   * one-element array.
   *
   * Adapters SHOULD opportunistically evict expired records on `add`.
   */
  add(records: MemoryRecord | MemoryRecord[]): Promise<void>

  /**
   * Fetch a record by id within a scope.
   *
   * Returns `undefined` when:
   * - no record exists with the given id, OR
   * - a record exists but its scope does not match the supplied `scope`, OR
   * - the record has expired (`expiresAt` is in the past).
   *
   * In all three cases the adapter returns `undefined` — it does not throw and
   * does not leak the existence of out-of-scope records.
   */
  get(id: string, scope: MemoryScope): Promise<MemoryRecord | undefined>

  /**
   * Patch a record in place.
   *
   * On success, returns the updated record. The adapter:
   * - preserves `id`, `scope`, and `createdAt` (these cannot be patched),
   * - bumps `updatedAt` to the current epoch ms,
   * - merges the supplied patch over the existing record.
   *
   * Returns `undefined` when the target record does not exist, lives in a
   * different scope, or has expired — symmetric with {@link MemoryAdapter.get}.
   */
  update(
    id: string,
    scope: MemoryScope,
    patch: MemoryRecordPatch,
  ): Promise<MemoryRecord | undefined>

  /**
   * Run a relevance-ranked search within a scope.
   *
   * The ranking strategy (lexical, semantic, hybrid) is adapter-defined.
   * Pagination is via the opaque `query.cursor` / `result.nextCursor` pair —
   * the cursor format is adapter-internal and MUST NOT be parsed by callers.
   * Expired records are filtered out.
   */
  search(query: MemoryQuery): Promise<MemorySearchResult>

  /**
   * Browse records by scope without relevance ranking.
   *
   * This is the non-relevance counterpart to `search`, intended for inspector
   * UIs, admin tooling, and bulk export. Ordering is controlled by
   * `options.order`. Expired records are filtered out.
   */
  list(
    scope: MemoryScope,
    options?: MemoryListOptions,
  ): Promise<MemoryListResult>

  /**
   * Delete records by id within a scope.
   *
   * Ids that do not exist or whose record lives in a different scope are
   * silently no-op'd — `delete` does not throw on missing ids, and it MUST NOT
   * cross scope boundaries.
   */
  delete(ids: string[], scope: MemoryScope): Promise<void>

  /**
   * Remove ALL records that match the supplied scope.
   *
   * Scope matching uses the same isolation semantics as every other method:
   * only records whose scope matches the supplied scope are removed. An empty
   * scope (`{}`) matches everything by definition, but adapters MUST NOT treat
   * `clear({})` as a casual "wipe the database" operation. Implementations
   * SHOULD either reject empty-scope `clear` outright or guard it behind an
   * explicit safety check; treating it as a silent global wipe is considered
   * misuse.
   */
  clear(scope: MemoryScope): Promise<void>
}

/**
 * Pluggable embedding provider. Used by the middleware to compute query and
 * record embeddings when the adapter relies on vector search.
 *
 * `embed` may be invoked multiple times within a single chat run — once on the
 * retrieval path (to embed the user query) and optionally again on the persist
 * path (to embed assistant text or extracted facts). Implementations SHOULD be
 * idempotent: embedding the same input twice should yield the same vector.
 */
export interface MemoryEmbedder {
  embed(text: string): Promise<number[]>
}

// ===========================
// Mutation ops
// ===========================

/**
 * A single memory mutation, used as the return type of `extractMemories` and
 * `onToolResult` to express add/update/delete intent in one stream.
 *
 * As shorthand, those hooks may also return a plain `MemoryRecord[]`, which
 * the middleware treats as `[{ op: 'add', record }, ...]` — one add per
 * record.
 */
export type MemoryOp =
  | { op: 'add'; record: MemoryRecord }
  | { op: 'update'; id: string; patch: MemoryRecordPatch }
  | { op: 'delete'; id: string }

// ===========================
// Middleware options
// ===========================

/**
 * Configuration for the memory middleware.
 *
 * The middleware orchestrates two paths around a chat run:
 * - **Retrieval (read-side)**: gated by `shouldRetrieve`, runs `adapter.search`,
 *   optionally pipes hits through `rerank`, then renders into the prompt via
 *   `render`.
 * - **Persistence (write-side)**: gated by `shouldRemember`, calls
 *   `extractMemories` at finish (and `onToolResult` per completed tool call),
 *   commits ops to the adapter, then invokes `afterPersist` with the records
 *   that were newly added.
 *
 * `events.*` callbacks are app-level lifecycle hooks that fire alongside the
 * devtools events — use them for application telemetry that should not depend
 * on devtools being installed.
 */
export interface MemoryMiddlewareOptions {
  /** The storage adapter to read from / write to. */
  adapter: MemoryAdapter

  /**
   * Scope for every adapter call this middleware makes.
   *
   * The function form is the safer default for multi-tenant apps: it lets the
   * middleware derive scope per request from the chat context (e.g. from
   * authenticated session info attached by the host). Scope MUST be derived
   * server-side from trusted state — never accept scope fields directly from
   * client input, or one user's request can read or write another user's
   * memory.
   */
  scope:
    | MemoryScope
    | ((ctx: ChatMiddlewareContext) => MemoryScope | Promise<MemoryScope>)

  /**
   * Optional embedding provider. Required when the configured adapter relies
   * on vector search and records / queries do not arrive pre-embedded.
   */
  embedder?: MemoryEmbedder

  /** Maximum number of hits to retrieve per turn. Defaults to `6`. */
  topK?: number
  /** Drop hits with `score < minScore`. Defaults to `0.15`. */
  minScore?: number
  /** Restrict retrieval to the given record kinds. Defaults to all kinds. */
  kinds?: MemoryKind[]
  /**
   * Render retrieved hits into a string injected into the prompt. Replaces
   * the built-in `defaultRenderMemory` formatter when provided.
   */
  render?: (hits: MemoryHit[]) => string

  /**
   * Write-side gate: decide whether a given turn should produce memories at
   * all. Returning `false` short-circuits `extractMemories` and the persist
   * path for the current turn.
   */
  shouldRemember?: (args: {
    message: { role: MemoryRole; content: string }
    responseText?: string
  }) => boolean | Promise<boolean>

  /**
   * Read-side gate: decide whether to run retrieval for the current user
   * message. Returning `false` skips the entire retrieval path (search,
   * rerank, render) for this turn — symmetric with `shouldRemember` on the
   * write side.
   */
  shouldRetrieve?: (args: {
    userText: string
    scope: MemoryScope
  }) => boolean | Promise<boolean>

  /**
   * Optional re-ranker. Runs after `adapter.search` returns hits and before
   * `render` formats them into the prompt — use this to apply application-
   * specific ranking signals (recency boosts, importance weighting,
   * cross-encoder reranking, etc.).
   */
  rerank?: (
    hits: MemoryHit[],
    args: { scope: MemoryScope; query: string; ctx: ChatMiddlewareContext },
  ) => MemoryHit[] | Promise<MemoryHit[]>

  /**
   * Extract memory mutations from a completed turn. Runs at finish, after the
   * assistant response is fully accumulated.
   *
   * May return a mixed `MemoryOp[]` to express adds, updates, and deletes in a
   * single batch, or — as shorthand — a plain `MemoryRecord[]`, which the
   * middleware treats as all-add (`[{ op: 'add', record }, ...]`). Returning
   * `undefined` is a no-op.
   */
  extractMemories?: (args: {
    userText: string
    responseText: string
    scope: MemoryScope
    adapter: MemoryAdapter
  }) =>
    | Promise<MemoryOp[] | MemoryRecord[] | undefined>
    | MemoryOp[]
    | MemoryRecord[]
    | undefined

  /**
   * Per-tool-call persistence hook. Runs once for each completed tool call
   * with its arguments and result, allowing the app to persist tool output as
   * memory (typical `kind` is `'tool-result'`).
   *
   * The middleware defers the resulting work via `ctx.defer` so it does not
   * block the chat stream. Same return-shape conventions as `extractMemories`
   * — `MemoryOp[]`, `MemoryRecord[]` shorthand, or `undefined`.
   */
  onToolResult?: (args: {
    toolName: string
    toolCallId: string
    args: unknown
    result: unknown
    scope: MemoryScope
    adapter: MemoryAdapter
  }) =>
    | Promise<MemoryOp[] | MemoryRecord[] | undefined>
    | MemoryOp[]
    | MemoryRecord[]
    | undefined

  /**
   * Post-persist callback invoked after `adapter.add` commits successfully.
   *
   * `newRecords` contains only the records that were newly added on this
   * turn — it does NOT include records that were updated or deleted. Use this
   * for "memory was just written" side-effects (analytics, indexing,
   * notifications).
   */
  afterPersist?: (args: {
    newRecords: MemoryRecord[]
    scope: MemoryScope
    adapter: MemoryAdapter
  }) => Promise<void> | void

  /**
   * Application-level lifecycle callbacks.
   *
   * These fire in addition to (not instead of) the devtools events emitted by
   * the middleware — they are the appropriate place to wire app telemetry,
   * logging, or custom progress UX that should not depend on devtools.
   */
  events?: {
    /** Fired before the retrieval path runs. */
    onRetrieveStart?: (args: {
      scope: MemoryScope
      query: string
    }) => void | Promise<void>
    /** Fired after retrieval completes, with the final hit set (post-rerank). */
    onRetrieveEnd?: (args: {
      scope: MemoryScope
      hits: MemoryHit[]
    }) => void | Promise<void>
    /** Fired before the persist path commits records to the adapter. */
    onPersistStart?: (args: {
      scope: MemoryScope
      records: MemoryRecord[]
    }) => void | Promise<void>
    /** Fired after the persist path commits records to the adapter. */
    onPersistEnd?: (args: {
      scope: MemoryScope
      records: MemoryRecord[]
    }) => void | Promise<void>
    /** Fired when retrieval, persistence, or extraction throws. */
    onError?: (args: {
      scope: MemoryScope
      phase: 'retrieve' | 'persist' | 'extract'
      error: unknown
    }) => void | Promise<void>
  }

  /**
   * Strict mode. When `false` (the default) the middleware swallows retrieval
   * and persistence failures so chat continues to function even if memory is
   * degraded. When `true`, those failures throw and abort the run — choose
   * this when memory correctness is critical (e.g. compliance contexts where
   * a missed write is worse than a failed turn).
   */
  strict?: boolean
}
