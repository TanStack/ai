import type { CompactionAppliedEvent } from '@tanstack/ai-event-client'

const MAX_EVENTS = 50

export interface CompactionMessagePreview {
  role: string
  tokens: number
  text: string
}

export interface CompactionEventRecord {
  id: string
  timestamp: number
  hookId?: string
  clientId?: string
  threadId?: string
  runId?: string
  before: number
  after: number
  messagesBefore: number
  messagesAfter: number
  reusedCheckpoint: boolean
  maxTokens?: number
  strategyKey?: string
  dropped?: Array<CompactionMessagePreview>
  result?: Array<CompactionMessagePreview>
}

export interface CompactionRegistryState {
  events: Array<CompactionEventRecord>
}

export function createCompactionRegistryState(): CompactionRegistryState {
  return { events: [] }
}

function eventId(event: CompactionAppliedEvent): string {
  return [
    'cmp',
    String(event.timestamp),
    event.hookId ?? event.clientId ?? event.threadId ?? 'unknown',
    String(event.before),
    String(event.after),
  ].join('-')
}

/** Append one `compaction:applied` event. Newest stays at the end. */
export function applyCompactionEvent(
  state: CompactionRegistryState,
  event: CompactionAppliedEvent,
): void {
  state.events.push({
    id: event.eventId ?? eventId(event),
    timestamp: event.timestamp,
    hookId: event.hookId,
    clientId: event.clientId,
    threadId: event.threadId,
    runId: event.runId,
    before: event.before,
    after: event.after,
    messagesBefore: event.messagesBefore,
    messagesAfter: event.messagesAfter,
    reusedCheckpoint: event.reusedCheckpoint,
    maxTokens: event.maxTokens,
    strategyKey: event.strategyKey,
    dropped: event.dropped,
    result: event.result,
  })
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS)
  }
}

export function clearCompactionRegistry(state: CompactionRegistryState): void {
  state.events = []
}

export function compactionEventsForHook(
  state: CompactionRegistryState,
  hook: { id: string; clientId?: string; threadId?: string },
): Array<CompactionEventRecord> {
  const matched = state.events.filter((event) => {
    if (event.hookId && event.hookId === hook.id) return true
    if (event.clientId && hook.clientId && event.clientId === hook.clientId) {
      return true
    }
    if (event.threadId && hook.threadId && event.threadId === hook.threadId) {
      return true
    }
    return false
  })
  if (matched.length > 0) return matched
  return state.events
}
