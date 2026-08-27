import type {
  MemoryErrorEvent,
  MemoryPersistCompletedEvent,
  MemoryPersistStartedEvent,
  MemoryRetrieveCompletedEvent,
  MemoryRetrieveStartedEvent,
  MemoryScopeLite,
  MemorySnapshotEvent,
} from '@tanstack/ai-event-client'

/** One row in a scope's operations timeline. */
export interface MemoryEventRecord {
  id: string
  type:
    | 'retrieve:started'
    | 'retrieve:completed'
    | 'persist:started'
    | 'persist:completed'
    | 'error'
  timestamp: number
  /** Most recent adapter id seen for this scope. */
  adapter: string
  /** recall:started — the recall query (last user text). */
  query?: string
  /** recall:completed. */
  fragmentCount?: number
  hasTools?: boolean
  systemPromptChars?: number
  /** persist:completed. */
  receiptCount?: number
  okCount?: number
  /** recall:completed / persist:completed. */
  durationMs?: number
  /** error. */
  phase?: 'recall' | 'save'
  error?: { name: string; message: string }
}

/** A flat fact row, mirroring `MemoryFact` from `@tanstack/ai-memory`. */
export interface MemoryFactRecord {
  id: string
  text: string
  source?: string
  createdAt?: string
}

/** Latest `inspect()` + `listFacts()` snapshot pushed via `memory:snapshot`. */
export interface MemorySnapshotRecord {
  takenAt: string
  data: unknown
  facts: Array<MemoryFactRecord>
}

/** Everything known about memory for a single composite scope. */
export interface MemoryScopeState {
  key: string
  threadId: string
  userId?: string
  tenantId?: string
  namespace?: string
  /** Most recent adapter id seen for this scope. */
  adapter?: string
  events: Array<MemoryEventRecord>
  snapshot?: MemorySnapshotRecord
  lastActivity: number
}

export interface MemoryRegistryState {
  scopes: Record<string, MemoryScopeState>
}

export function createMemoryRegistryState(): MemoryRegistryState {
  return { scopes: {} }
}

/**
 * Escape `:` / `\` / `_` so composite keys cannot collide when a dim contains
 * the separator or the unset sentinel (mirrors redis scope-key hardening).
 */
function escapeScopeDim(value: string): string {
  return value.replace(/[\\:_]/g, '\\$&')
}

/** Unset optional dims serialize as `_` (same convention as the redis adapter). */
function scopeDim(value: string | undefined): string {
  return value != null && value.length > 0 ? escapeScopeDim(value) : '_'
}

/**
 * Stable scope key:
 * `{tenantId|_}:{userId|_}:{threadId}:{namespace|_}`.
 * Absent scope (e.g. `memory:error` before resolve) buckets to `(unknown)`.
 */
export function memoryScopeKey(scope: MemoryScopeLite | undefined): string {
  if (!scope) return '(unknown)'
  return `${scopeDim(scope.tenantId)}:${scopeDim(scope.userId)}:${escapeScopeDim(scope.threadId)}:${scopeDim(scope.namespace)}`
}

/** Human-readable label for the Memory panel scope picker. */
export function memoryScopeLabel(entry: MemoryScopeState): string {
  const isUnknownScope = entry.key === '(unknown)' || !entry.threadId
  if (isUnknownScope) return '(unknown)'
  const parts = [
    entry.tenantId,
    entry.userId,
    entry.threadId,
    entry.namespace,
  ].filter((p): p is string => p != null && p.length > 0)
  return parts.join(' · ')
}

const MAX_EVENTS_PER_SCOPE = 200

function ensureScope(
  state: MemoryRegistryState,
  scope: MemoryScopeLite | undefined,
): MemoryScopeState {
  const key = memoryScopeKey(scope)
  let entry = state.scopes[key]
  if (!entry) {
    entry = {
      key,
      threadId: scope?.threadId ?? '',
      userId: scope?.userId,
      tenantId: scope?.tenantId,
      namespace: scope?.namespace,
      events: [],
      lastActivity: 0,
    }
    state.scopes[key] = entry
  }
  // Only merge metadata when we have a real scope (not the unscoped error bucket).
  if (scope) {
    if (scope.userId) entry.userId = scope.userId
    if (scope.tenantId) entry.tenantId = scope.tenantId
    if (scope.namespace) entry.namespace = scope.namespace
  }
  return entry
}

let fallbackCounter = 0

function eventId(
  payload: { eventId?: string },
  type: string,
  ts: number,
): string {
  const eventIdValue = payload.eventId
  if (eventIdValue !== undefined) {
    const hasEventId = eventIdValue.length > 0
    if (hasEventId) return eventIdValue
  }
  return `${type}:${ts}:${fallbackCounter++}`
}

type MemoryEventPayload =
  | ({ type: 'retrieve:started' } & MemoryRetrieveStartedEvent)
  | ({ type: 'retrieve:completed' } & MemoryRetrieveCompletedEvent)
  | ({ type: 'persist:started' } & MemoryPersistStartedEvent)
  | ({ type: 'persist:completed' } & MemoryPersistCompletedEvent)
  | ({ type: 'error' } & MemoryErrorEvent)

/** Append one `memory:*` operation event to its scope's timeline. */
export function applyMemoryEvent(
  state: MemoryRegistryState,
  event: MemoryEventPayload,
): void {
  const entry = ensureScope(state, event.scope)
  entry.adapter = event.adapter
  entry.lastActivity = Math.max(entry.lastActivity, event.timestamp)

  const record: MemoryEventRecord = {
    id: eventId(event, event.type, event.timestamp),
    type: event.type,
    timestamp: event.timestamp,
    adapter: event.adapter,
  }
  switch (event.type) {
    case 'retrieve:started':
      record.query = event.query
      break
    case 'retrieve:completed':
      record.fragmentCount = event.fragmentCount
      record.hasTools = event.hasTools
      record.systemPromptChars = event.systemPromptChars
      record.durationMs = event.durationMs
      break
    case 'persist:completed':
      record.receiptCount = event.receiptCount
      record.okCount = event.okCount
      record.durationMs = event.durationMs
      break
    case 'error':
      record.phase = event.phase
      record.error = event.error
      break
    case 'persist:started':
      break
  }

  entry.events.push(record)
  if (entry.events.length > MAX_EVENTS_PER_SCOPE) {
    entry.events.splice(0, entry.events.length - MAX_EVENTS_PER_SCOPE)
  }
}

/** Replace a scope's stored-state snapshot from a `memory:snapshot` event. */
export function applyMemorySnapshot(
  state: MemoryRegistryState,
  event: MemorySnapshotEvent,
): void {
  const entry = ensureScope(state, event.scope)
  entry.adapter = event.adapter
  entry.lastActivity = Math.max(entry.lastActivity, event.timestamp)
  entry.snapshot = {
    takenAt: event.takenAt,
    data: event.data,
    facts: event.facts,
  }
}

export function clearMemoryRegistry(state: MemoryRegistryState): void {
  state.scopes = {}
}
