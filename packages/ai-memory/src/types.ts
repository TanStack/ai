/**
 * Public contract for the TanStack AI memory subsystem.
 *
 * A memory backend implements ONE contract with two verbs: {@link MemoryAdapter.recall}
 * and {@link MemoryAdapter.save}. This is deliberately the shape every real memory
 * provider (mem0, honcho, hindsight, …) already exposes — "what's relevant for this
 * query?" and "remember this turn". The middleware ({@link memoryMiddleware}) is thin:
 * it calls `recall` before the model runs and defers `save` after the turn finishes.
 *
 * Adapters own everything else. Extraction (turning a turn into stored facts),
 * ranking, rendering into a prompt, scope isolation, and expiry are all the
 * adapter's responsibility — the middleware never inspects records. The built-in
 * `inMemory()` / `redis()` adapters keep their store/scoring internals private
 * behind `recall`/`save`; vendor adapters map these two verbs onto their APIs.
 */

import type { Tool } from '@tanstack/ai'

// ===========================
// Scope & turn primitives
// ===========================

/**
 * Isolation scope for memory reads and writes. Opaque to the middleware —
 * each adapter interprets it (vendors map it to bank/user ids; the built-in
 * stores key their internal record space by it).
 *
 * Derive scope server-side from trusted session state — never from client
 * input, or one user's request can read or write another user's memory.
 */
export interface MemoryScope {
  /** Conversation/session identifier. Required — the minimal isolation key. */
  sessionId: string
  /** Optional durable end-user identity, for cross-session recall. */
  userId?: string
}

/** A completed conversation turn handed to {@link MemoryAdapter.save}. */
export interface MemoryTurn {
  user: string
  assistant: string
}

// ===========================
// Recall
// ===========================

/** A discrete recalled item, when the adapter produces them. */
export interface MemoryFragment {
  /** The recalled text. */
  text: string
  /** Provenance hint (record id, vendor result type, etc.). */
  source: string
}

/**
 * Result of {@link MemoryAdapter.recall}. Everything the middleware needs to
 * augment the run: a pre-rendered prompt block, optional discrete fragments,
 * and optional tools the adapter wants exposed to the model this turn.
 */
export interface RecallResult {
  /**
   * Pre-rendered block to inject into the system prompt. An empty string means
   * "nothing to inject" — the middleware skips it.
   */
  systemPrompt: string
  /**
   * Discrete recalled items, when the adapter produces them. Omitted for
   * engines that return synthesized output (e.g. honcho's dialectic answer).
   */
  fragments?: Array<MemoryFragment>
  /**
   * Tools the adapter wants exposed to the model for this turn (e.g. hindsight's
   * retain/recall/reflect tools). Merged into the run's tool set by the
   * middleware. Omit or `[]` when the adapter exposes no tools.
   */
  tools?: Array<Tool>
  /**
   * System-prompt text explaining when/how to use {@link RecallResult.tools}.
   * Injected ahead of `systemPrompt`. Omit or `''` when there are no tools.
   */
  toolGuidance?: string
  /** Raw vendor payload, surfaced for devtools/inspection. */
  raw?: unknown
}

// ===========================
// Save
// ===========================

/**
 * Receipt for a single underlying write performed by {@link MemoryAdapter.save}.
 * One turn can produce several receipts (e.g. hindsight writes the user and
 * assistant utterances separately), so `save` returns an array.
 */
export interface SaveReceipt {
  ok: boolean
  /** Optional adapter-reported write latency (ms), for devtools. */
  latencyMs?: number
  /** Present when `ok` is `false`. */
  error?: string
  /** Raw vendor payload, surfaced for devtools/inspection. */
  raw?: unknown
}

// ===========================
// Optional introspection (devtools / admin panels)
// ===========================

/** Full snapshot returned by the optional {@link MemoryAdapter.inspect}. */
export interface MemorySnapshot {
  /** ISO timestamp when the snapshot was taken. */
  takenAt: string
  /** Adapter-defined snapshot payload. */
  data: unknown
}

/** A flat fact row returned by the optional {@link MemoryAdapter.listFacts}. */
export interface MemoryFact {
  id: string
  text: string
  source?: string
  /** ISO timestamp, when the adapter tracks creation time. */
  createdAt?: string
}

// ===========================
// Adapter contract
// ===========================

/**
 * The single memory adapter contract. All backends — the built-in `inMemory()`
 * and `redis()` adapters as well as vendor adapters (`hindsight()`, `mem0()`,
 * `honcho()`) — implement `recall` + `save`. `inspect`/`listFacts` are optional
 * and exist only for devtools/admin surfaces.
 */
export interface MemoryAdapter {
  /** Stable id used in logs, devtools, and event payloads (e.g. 'in-memory', 'hindsight'). */
  readonly id: string
  /** Optional human-readable label; defaults to {@link MemoryAdapter.id} in logs. */
  readonly name?: string

  /**
   * Read side — retrieve what's relevant to `query` within `scope`. The ranking
   * strategy (lexical, semantic, hybrid, vendor-native) is entirely the
   * adapter's concern.
   */
  recall: (scope: MemoryScope, query: string) => Promise<RecallResult>

  /**
   * Write side — persist a completed turn. Extraction (turn → stored facts)
   * happens HERE, inside the adapter. Returns one receipt per underlying write.
   */
  save: (scope: MemoryScope, turn: MemoryTurn) => Promise<Array<SaveReceipt>>

  /** Optional — full snapshot for a devtools inspection panel. */
  inspect?: (scope: MemoryScope) => Promise<MemorySnapshot>
  /** Optional — flat fact list for a devtools panel. */
  listFacts?: (scope: MemoryScope) => Promise<Array<MemoryFact>>
}
