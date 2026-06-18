/**
 * Persistence store contracts.
 *
 * The persisted run log is the AG-UI `StreamChunk` stream itself — there is no
 * separate event type. Each store is an independently swappable seam; a
 * `ChatPersistence` aggregate bundles the ones a deployment uses, gated by
 * {@link PersistenceMode}.
 */
import type {
  LockStore,
  ModelMessage,
  StreamChunk,
  TokenUsage,
} from '@tanstack/ai'

/**
 * How much to persist.
 * - `messages`: thread message history only.
 * - `chat`: messages + runs + event log + durable stream + usage (everything
 *   needed for resumable conversations).
 * - `agent`: everything in `chat` plus sandbox records, approvals, and
 *   artifacts (for sandbox-backed harness runs).
 */
export type PersistenceMode = 'messages' | 'chat' | 'agent'

/** A persisted, sequenced event (a chunk plus its per-run sequence). */
export interface PersistedEvent {
  seq: number
  event: StreamChunk
}

/** Conversation history, keyed by threadId. Holds server-canonical messages. */
export interface MessageStore {
  loadThread: (threadId: string) => Promise<Array<ModelMessage>>
  saveThread: (threadId: string, messages: Array<ModelMessage>) => Promise<void>
}

/** Lifecycle status of a run. */
export type RunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

/** One execution attempt of `chat()`. */
export interface RunRecord {
  runId: string
  threadId: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  error?: string
  usage?: TokenUsage
}

export interface RunStore {
  /** Create the run if new, or return the existing record (idempotent resume). */
  createOrResume: (
    input: Pick<RunRecord, 'runId' | 'threadId'> & {
      status?: RunStatus
      startedAt: number
    },
  ) => Promise<RunRecord>
  update: (
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ) => Promise<void>
  get: (runId: string) => Promise<RunRecord | null>
}

/** Append-only AG-UI event log — the source of truth for a run. */
export interface EventLog {
  append: (runId: string, seq: number, event: StreamChunk) => Promise<void>
  /** Replay persisted events for a run, optionally only those after a seq. */
  read: (
    runId: string,
    opts?: { afterSeq?: number },
  ) => AsyncIterable<PersistedEvent>
  /** Whether any events have been persisted for the run. */
  hasRun: (runId: string) => Promise<boolean>
  /** Highest persisted seq for the run, or 0 when none. */
  latestSeq: (runId: string) => Promise<number>
}

/** Live fan-out of run events to subscribers (e.g. CF Durable Objects). */
export interface DurableRunStream {
  publish: (runId: string, seq: number, event: StreamChunk) => Promise<void>
}

/** A persisted approval request + its resolution. */
export interface ApprovalRecord {
  approvalId: string
  runId: string
  threadId: string
  status: 'pending' | 'granted' | 'denied'
  requestedAt: number
  resolvedAt?: number
  payload: Record<string, unknown>
}

export interface ApprovalStore {
  create: (record: Omit<ApprovalRecord, 'resolvedAt'>) => Promise<void>
  resolve: (approvalId: string, granted: boolean) => Promise<void>
  get: (approvalId: string) => Promise<ApprovalRecord | null>
  /** All decided approvals for a thread, as an approvalId→granted map. */
  decisionsForThread: (threadId: string) => Promise<Map<string, boolean>>
}

/** Metadata (and optionally inline bytes) for an agent-produced artifact. */
export interface ArtifactRecord {
  artifactId: string
  runId: string
  threadId: string
  name: string
  mimeType: string
  size: number
  /** Inline bytes for small artifacts; large ones use an external store (R2). */
  bytes?: Uint8Array
  externalUrl?: string
  createdAt: number
}

export interface ArtifactStore {
  save: (record: ArtifactRecord) => Promise<void>
  get: (artifactId: string) => Promise<ArtifactRecord | null>
  list: (runId: string) => Promise<Array<ArtifactRecord>>
}

/**
 * Aggregate of the stores a deployment uses. `mode` declares the intended
 * coverage; individual stores are present according to it (and to what a
 * backend supports). `locks` (durable mutex) is the core {@link LockStore}.
 */
export interface ChatPersistence {
  mode: PersistenceMode
  messages?: MessageStore
  runs?: RunStore
  events?: EventLog
  stream?: DurableRunStream
  approvals?: ApprovalStore
  artifacts?: ArtifactStore
  locks?: LockStore
}

/**
 * Identity helper for assembling a {@link ChatPersistence} from low-level
 * stores. Pure pass-through today; the named entry point advanced users wire.
 */
export function defineChatPersistence(
  persistence: ChatPersistence,
): ChatPersistence {
  return persistence
}
