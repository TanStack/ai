import type { Scope, Tool } from '@tanstack/ai'

export type MemoryScope = Scope

/** A completed conversation turn handed to {@link MemoryAdapter.save}. */
export interface MemoryTurn {
  user: string
  assistant: string
}

/** A discrete recalled item, when the adapter produces them. */
export interface MemoryFragment {
  /** The recalled text. */
  text: string
  /** Provenance hint (record id, vendor result type, etc.). */
  source: string
}

export interface RecallResult {
  systemPrompt: string
  fragments?: Array<MemoryFragment>
  tools?: Array<Tool>
  toolGuidance?: string
  /** Raw vendor payload, surfaced for devtools/inspection. */
  raw?: unknown
}

export interface SaveReceipt {
  ok: boolean
  /** Optional adapter-reported write latency (ms), for devtools. */
  latencyMs?: number
  /** Present when `ok` is `false`. */
  error?: string
  /** Raw vendor payload, surfaced for devtools/inspection. */
  raw?: unknown
}

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

export interface MemoryAdapter {
  /** Stable id used in logs, devtools, and event payloads (e.g. 'in-memory', 'hindsight'). */
  readonly id: string
  /** Optional human-readable label; defaults to {@link MemoryAdapter.id} in logs. */
  readonly name?: string

  recall: (scope: MemoryScope, query: string) => Promise<RecallResult>

  save: (scope: MemoryScope, turn: MemoryTurn) => Promise<Array<SaveReceipt>>

  /** Optional — full snapshot for a devtools inspection panel. */
  inspect?: (scope: MemoryScope) => Promise<MemorySnapshot>
  /** Optional — flat fact list for a devtools panel. */
  listFacts?: (scope: MemoryScope) => Promise<Array<MemoryFact>>
}
