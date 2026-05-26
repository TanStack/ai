import type {
  AIDevtoolsEventEnvelope,
  AIDevtoolsEventSource,
  AIDevtoolsEventVisibility,
  DevtoolsToolFixtureApplyEvent,
  HookRegisteredEvent,
  HookStateSnapshotEvent,
  HookUnregisteredEvent,
  HookUpdatedEvent,
  RunLifecycleEvent,
  ToolsRegisteredEvent,
} from '@tanstack/ai-event-client'

export type HookOutputKind =
  | 'chat'
  | 'text'
  | 'structured'
  | 'image'
  | 'video'
  | 'audio'

export type HookLifecycle =
  | 'mounted'
  | 'active'
  | 'streaming'
  | 'errored'
  | 'stale'
  | 'unmounted'

export interface RegisteredTool {
  name: string
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  needsApproval?: boolean
  metadata?: unknown
}

export interface ToolFixtureRecord {
  id: string
  createdAt: number
  name?: string
  hookId?: string
  threadId?: string
  runId?: string
  toolName: string
  input: unknown
  output: unknown
  execute?: boolean
  message?: ToolFixtureMessage
  toolCallId?: string
  messageId?: string
  errorText?: string
}

export interface ToolFixtureMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<unknown>
  createdAt?: number | string
}

export interface ToolFixtureRecordDraft {
  id?: string
  createdAt?: number
  name?: string
  hookId?: string
  threadId?: string
  runId?: string
  toolName: string
  input: unknown
  output?: unknown
  execute?: boolean
  message?: ToolFixtureMessage
  toolCallId?: string
  messageId?: string
  errorText?: string
}

export interface TimelineEvent {
  id: string
  eventType: string
  timestamp: number
  source?: AIDevtoolsEventSource
  visibility?: AIDevtoolsEventVisibility
  runtimeId?: string
  hookId?: string
  threadId?: string
  runId?: string
  messageId?: string
  toolCallId?: string
  payload: unknown
}

export interface RunRecord {
  id: string
  hookId?: string
  threadId?: string
  status: RunLifecycleEvent['status']
  source?: AIDevtoolsEventSource
  visibility?: AIDevtoolsEventVisibility
  startedAt: number
  updatedAt: number
  completedAt?: number
  error?: string
  eventIds: Array<string>
}

export interface HookRecord {
  id: string
  hookName: string
  displayName?: string
  framework?: string
  outputKind?: HookOutputKind
  lifecycle: HookLifecycle
  clientId?: string
  threadId?: string
  correlationId?: string
  registeredAt: number
  updatedAt: number
  unregisteredAt?: number
  state: Record<string, unknown>
  tools: Array<RegisteredTool>
  runIds: Array<string>
  eventIds: Array<string>
  activityRunIds: Array<string>
}

export interface HookRegistryState {
  hooks: Record<string, HookRecord>
  runs: Record<string, RunRecord>
  events: Record<string, TimelineEvent>
  fixtures: Array<ToolFixtureRecord>
  activeHookId: string | null
  seenEventIds: Record<string, true>
  seenHookActivityCounts: Record<string, number>
  unregisteredHookIds: Record<string, true>
}

export function createHookRegistryState(): HookRegistryState {
  return {
    hooks: {},
    runs: {},
    events: {},
    fixtures: [],
    activeHookId: null,
    seenEventIds: {},
    seenHookActivityCounts: {},
    unregisteredHookIds: {},
  }
}

type KnownHookEvent =
  | HookRegisteredEvent
  | HookUpdatedEvent
  | HookUnregisteredEvent
  | HookStateSnapshotEvent
  | RunLifecycleEvent
  | ToolsRegisteredEvent
  | DevtoolsToolFixtureApplyEvent

type RuntimeScopedHookEvent = KnownHookEvent & { runtimeId?: string }

interface HookUpsertEvent extends Partial<
  Pick<
    HookRegisteredEvent,
    | 'clientId'
    | 'displayName'
    | 'framework'
    | 'outputKind'
    | 'source'
    | 'threadId'
    | 'visibility'
    | 'correlationId'
  >
> {
  hookId: string
  hookName: string
  lifecycle: HookLifecycle
  timestamp: number
}

export function markEventSeen(
  state: HookRegistryState,
  eventName: string,
  event: Partial<AIDevtoolsEventEnvelope> & {
    runtimeId?: string
    timestamp?: number
  },
): boolean {
  const key =
    event.eventId ??
    [
      eventName,
      event.source ?? 'unknown',
      event.visibility ?? 'unknown',
      event.runtimeId ?? 'no-runtime',
      event.hookId ?? event.clientId ?? 'no-hook',
      event.threadId ?? 'no-thread',
      event.runId ?? 'no-run',
      event.messageId ?? 'no-message',
      event.toolCallId ?? 'no-tool-call',
      event.timestamp ?? 'no-time',
    ].join(':')

  if (state.seenEventIds[key]) {
    return false
  }
  state.seenEventIds[key] = true
  return true
}

export function applyHookEvent(
  state: HookRegistryState,
  eventName: string,
  event: RuntimeScopedHookEvent,
): void {
  if (isForeignClientRuntimeEvent(event)) {
    return
  }

  if (!markEventSeen(state, eventName, event)) {
    return
  }

  const timelineEvent = createTimelineEvent(eventName, event)
  state.events[timelineEvent.id] = timelineEvent

  switch (eventName) {
    case 'hook:registered': {
      const registered = event as HookRegisteredEvent
      delete state.unregisteredHookIds[registered.hookId]
      upsertHook(state, registered)
      attachEventToHook(state, registered.hookId, timelineEvent.id)
      break
    }
    case 'hook:updated': {
      const updated = event as HookUpdatedEvent
      if (state.unregisteredHookIds[updated.hookId]) {
        break
      }
      if (isStaleHookInstanceEvent(state, updated.hookId, updated)) {
        break
      }
      upsertHook(state, updated)
      attachEventToHook(state, updated.hookId, timelineEvent.id)
      break
    }
    case 'hook:unregistered': {
      const unregistered = event as HookUnregisteredEvent
      const existing = state.hooks[unregistered.hookId]
      if (
        existing?.clientId &&
        unregistered.clientId &&
        existing.clientId !== unregistered.clientId
      ) {
        break
      }
      if (
        existing?.correlationId &&
        unregistered.correlationId &&
        existing.correlationId !== unregistered.correlationId
      ) {
        break
      }
      if (existing && existing.registeredAt > unregistered.timestamp) {
        break
      }
      state.unregisteredHookIds[unregistered.hookId] = true
      removeHookRecord(state, unregistered.hookId)
      break
    }
    case 'hook:state-snapshot': {
      const snapshot = event as HookStateSnapshotEvent
      if (state.unregisteredHookIds[snapshot.hookId]) {
        break
      }
      if (isStaleHookInstanceEvent(state, snapshot.hookId, snapshot)) {
        break
      }
      upsertHook(state, {
        ...snapshot,
        lifecycle: inferLifecycleFromSnapshot(snapshot.state),
      })
      const hook = state.hooks[snapshot.hookId]
      if (hook) {
        hook.state = snapshot.state
        hook.updatedAt = snapshot.timestamp
      }
      attachEventToHook(state, snapshot.hookId, timelineEvent.id)
      // Generation hooks ship their run history inside the snapshot. When
      // devtools is opened after a run has already completed, the run
      // lifecycle events fired before mount are lost, so backfill the
      // global runs map and the hook's runIds from the snapshot itself.
      syncRunsFromSnapshot(state, snapshot, timelineEvent.id)
      break
    }
    case 'tools:registered': {
      const toolsEvent = event as ToolsRegisteredEvent
      if (state.unregisteredHookIds[toolsEvent.hookId]) {
        break
      }
      if (isStaleHookInstanceEvent(state, toolsEvent.hookId, toolsEvent)) {
        break
      }
      upsertHook(state, {
        ...toolsEvent,
        hookName: toolsEvent.hookName ?? toolsEvent.hookId,
        lifecycle: 'active',
      })
      const hook = state.hooks[toolsEvent.hookId]
      if (hook) {
        hook.tools = toolsEvent.tools
        hook.updatedAt = toolsEvent.timestamp
      }
      attachEventToHook(state, toolsEvent.hookId, timelineEvent.id)
      break
    }
    case 'run:created':
    case 'run:started':
    case 'run:updated':
    case 'run:completed':
    case 'run:errored':
    case 'run:cancelled': {
      const runEvent = event as RunLifecycleEvent
      if (runEvent.hookId && state.unregisteredHookIds[runEvent.hookId]) {
        break
      }
      if (
        runEvent.hookId &&
        isStaleHookInstanceEvent(state, runEvent.hookId, runEvent)
      ) {
        break
      }
      upsertRun(state, runEvent, timelineEvent.id)
      if (runEvent.hookId) {
        upsertUnknownHook(state, runEvent.hookId, runEvent)
        attachRunToHook(state, runEvent.hookId, runEvent.runId)
        attachActivityRunToHook(state, runEvent.hookId, runEvent.runId)
        attachEventToHook(state, runEvent.hookId, timelineEvent.id)
      }
      break
    }
    case 'devtools:tool-fixture:apply': {
      const fixtureEvent = event as DevtoolsToolFixtureApplyEvent
      if (fixtureEvent.hookId) {
        attachEventToHook(state, fixtureEvent.hookId, timelineEvent.id)
      }
      break
    }
  }

  if (state.activeHookId && !state.hooks[state.activeHookId]) {
    state.activeHookId = null
  }

  if (state.activeHookId) {
    markHookViewed(state, state.activeHookId)
  }
}

export function setActiveHook(
  state: HookRegistryState,
  hookId: string | null,
): void {
  state.activeHookId = hookId
  if (hookId) {
    markHookViewed(state, hookId)
  }
}

export function clearHookRegistry(state: HookRegistryState): void {
  state.hooks = {}
  state.runs = {}
  state.events = {}
  state.activeHookId = null
  state.seenEventIds = {}
  state.seenHookActivityCounts = {}
  state.unregisteredHookIds = {}
}

export function markHookViewed(state: HookRegistryState, hookId: string): void {
  const hook = state.hooks[hookId]
  if (!hook) return
  state.seenHookActivityCounts[hookId] = hook.activityRunIds.length
}

export function getHookUnseenEventCount(
  state: HookRegistryState,
  hookId: string,
): number {
  const hook = state.hooks[hookId]
  if (!hook) return 0
  const seenCount = state.seenHookActivityCounts[hookId] ?? 0
  return Math.max(0, hook.activityRunIds.length - seenCount)
}

export function addSavedFixture(
  state: HookRegistryState,
  fixture: ToolFixtureRecord,
): void {
  state.fixtures = [
    fixture,
    ...state.fixtures.filter((item) => item.id !== fixture.id),
  ].slice(0, 50)
}

export function removeSavedFixture(
  state: HookRegistryState,
  fixtureId: string,
): void {
  state.fixtures = state.fixtures.filter((fixture) => fixture.id !== fixtureId)
}

export function replaceSavedFixtures(
  state: HookRegistryState,
  fixtures: Array<ToolFixtureRecord>,
): void {
  state.fixtures = fixtures.slice(0, 50)
}

export function createToolFixtureRecord(
  draft: ToolFixtureRecordDraft,
): ToolFixtureRecord {
  const createdAt = draft.createdAt ?? Date.now()
  const fixtureScope = draft.hookId ?? draft.threadId ?? 'global'
  const fixtureKey = draft.toolCallId ?? createdAt

  return {
    id: draft.id ?? `fixture:${fixtureScope}:${draft.toolName}:${fixtureKey}`,
    createdAt,
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.hookId ? { hookId: draft.hookId } : {}),
    ...(draft.threadId ? { threadId: draft.threadId } : {}),
    ...(draft.runId ? { runId: draft.runId } : {}),
    toolName: draft.toolName,
    input: draft.input,
    output: draft.output ?? null,
    ...(draft.execute !== undefined ? { execute: draft.execute } : {}),
    ...(draft.message ? { message: draft.message } : {}),
    ...(draft.toolCallId ? { toolCallId: draft.toolCallId } : {}),
    ...(draft.messageId ? { messageId: draft.messageId } : {}),
    ...(draft.errorText ? { errorText: draft.errorText } : {}),
  }
}

function createTimelineEvent(
  eventType: string,
  event: RuntimeScopedHookEvent,
): TimelineEvent {
  return {
    id: event.eventId ?? `${eventType}:${event.timestamp}:${Math.random()}`,
    eventType,
    timestamp: event.timestamp,
    ...(event.source ? { source: event.source } : {}),
    ...(event.visibility ? { visibility: event.visibility } : {}),
    ...(event.runtimeId ? { runtimeId: event.runtimeId } : {}),
    ...(event.hookId ? { hookId: event.hookId } : {}),
    ...(event.threadId ? { threadId: event.threadId } : {}),
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.messageId ? { messageId: event.messageId } : {}),
    ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
    payload: event,
  }
}

function isForeignClientRuntimeEvent(event: RuntimeScopedHookEvent): boolean {
  return (
    event.source === 'client' &&
    typeof event.runtimeId === 'string' &&
    event.runtimeId !== getLocalAIDevtoolsRuntimeId()
  )
}

declare global {
  var __TANSTACK_AI_DEVTOOLS_RUNTIME_ID__: string | undefined
}

function getLocalAIDevtoolsRuntimeId(): string {
  if (!globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__) {
    globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__ = createRuntimeId()
  }
  return globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__
}

function createRuntimeId(): string {
  const cryptoLike = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string
      }
    }
  ).crypto
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function upsertHook(state: HookRegistryState, event: HookUpsertEvent): void {
  const existing = state.hooks[event.hookId]
  if (!existing) {
    state.hooks[event.hookId] = {
      id: event.hookId,
      hookName: event.hookName,
      ...(event.displayName ? { displayName: event.displayName } : {}),
      ...(event.framework ? { framework: event.framework } : {}),
      ...(event.outputKind ? { outputKind: event.outputKind } : {}),
      lifecycle: event.lifecycle,
      ...(event.clientId ? { clientId: event.clientId } : {}),
      ...(event.threadId ? { threadId: event.threadId } : {}),
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      registeredAt: event.timestamp,
      updatedAt: event.timestamp,
      state: {},
      tools: [],
      runIds: [],
      eventIds: [],
      activityRunIds: [],
    }
    return
  }

  existing.hookName = event.hookName
  if (event.displayName) existing.displayName = event.displayName
  if (event.framework) existing.framework = event.framework
  if (event.outputKind) existing.outputKind = event.outputKind
  if (event.clientId) existing.clientId = event.clientId
  if (event.threadId) existing.threadId = event.threadId
  if (event.correlationId) existing.correlationId = event.correlationId
  existing.lifecycle = event.lifecycle
  existing.updatedAt = event.timestamp
}

function isStaleHookInstanceEvent(
  state: HookRegistryState,
  hookId: string,
  event: RuntimeScopedHookEvent,
): boolean {
  const existing = state.hooks[hookId]
  return Boolean(
    existing?.correlationId &&
    event.correlationId &&
    existing.correlationId !== event.correlationId,
  )
}

function upsertUnknownHook(
  state: HookRegistryState,
  hookId: string,
  event: RunLifecycleEvent,
): void {
  if (state.hooks[hookId]) return
  state.hooks[hookId] = {
    id: hookId,
    hookName: hookId,
    lifecycle: 'active',
    ...(event.clientId ? { clientId: event.clientId } : {}),
    ...(event.threadId ? { threadId: event.threadId } : {}),
    registeredAt: event.timestamp,
    updatedAt: event.timestamp,
    state: {},
    tools: [],
    runIds: [],
    eventIds: [],
    activityRunIds: [],
  }
}

function removeHookRecord(state: HookRegistryState, hookId: string): void {
  const hook = state.hooks[hookId]
  const hookRunIds = new Set(hook?.runIds ?? [])

  for (const [runId, run] of Object.entries(state.runs)) {
    if (run.hookId === hookId || hookRunIds.has(runId)) {
      delete state.runs[runId]
    }
  }

  delete state.hooks[hookId]
  delete state.seenHookActivityCounts[hookId]

  if (state.activeHookId === hookId) {
    state.activeHookId = null
  }
}

function upsertRun(
  state: HookRegistryState,
  event: RunLifecycleEvent,
  eventId: string,
): void {
  const existing = state.runs[event.runId]
  if (!existing) {
    state.runs[event.runId] = {
      id: event.runId,
      ...(event.hookId ? { hookId: event.hookId } : {}),
      ...(event.threadId ? { threadId: event.threadId } : {}),
      status: event.status,
      ...(event.source ? { source: event.source } : {}),
      ...(event.visibility ? { visibility: event.visibility } : {}),
      startedAt: event.timestamp,
      updatedAt: event.timestamp,
      ...(isTerminalRunStatus(event.status)
        ? { completedAt: event.timestamp }
        : {}),
      ...(event.error ? { error: event.error } : {}),
      eventIds: [eventId],
    }
    return
  }

  if (event.hookId) existing.hookId = event.hookId
  if (event.threadId) existing.threadId = event.threadId
  if (event.source) existing.source = event.source
  if (event.visibility) existing.visibility = event.visibility
  existing.status = event.status
  existing.updatedAt = event.timestamp
  if (isTerminalRunStatus(event.status)) {
    existing.completedAt = event.timestamp
  }
  if (event.error) {
    existing.error = event.error
  }
  if (!existing.eventIds.includes(eventId)) {
    existing.eventIds.push(eventId)
  }
}

function attachRunToHook(
  state: HookRegistryState,
  hookId: string,
  runId: string,
): void {
  const hook = state.hooks[hookId]
  if (!hook || hook.runIds.includes(runId)) return
  hook.runIds.push(runId)
}

function syncRunsFromSnapshot(
  state: HookRegistryState,
  snapshot: HookStateSnapshotEvent,
  eventId: string,
): void {
  const rawRuns = (snapshot.state as { runs?: unknown }).runs
  if (!Array.isArray(rawRuns)) return
  for (const candidate of rawRuns) {
    if (!candidate || typeof candidate !== 'object') continue
    const run = candidate as {
      id?: unknown
      status?: unknown
      startedAt?: unknown
      updatedAt?: unknown
      completedAt?: unknown
      error?: unknown
    }
    if (typeof run.id !== 'string') continue
    const status = normalizeRunStatusFromSnapshot(run.status)
    const startedAt =
      typeof run.startedAt === 'number' ? run.startedAt : snapshot.timestamp
    const updatedAt =
      typeof run.updatedAt === 'number' ? run.updatedAt : startedAt
    const existing = state.runs[run.id]
    if (!existing) {
      state.runs[run.id] = {
        id: run.id,
        hookId: snapshot.hookId,
        status,
        startedAt,
        updatedAt,
        ...(typeof run.completedAt === 'number'
          ? { completedAt: run.completedAt }
          : isTerminalRunStatus(status)
            ? { completedAt: updatedAt }
            : {}),
        ...(typeof run.error === 'string' ? { error: run.error } : {}),
        eventIds: [eventId],
      }
    } else {
      existing.hookId = snapshot.hookId
      existing.status = status
      existing.updatedAt = updatedAt
      if (typeof run.completedAt === 'number') {
        existing.completedAt = run.completedAt
      } else if (isTerminalRunStatus(status) && !existing.completedAt) {
        existing.completedAt = updatedAt
      }
      if (typeof run.error === 'string') existing.error = run.error
      if (!existing.eventIds.includes(eventId)) {
        existing.eventIds.push(eventId)
      }
    }
    attachRunToHook(state, snapshot.hookId, run.id)
  }
}

function normalizeRunStatusFromSnapshot(
  value: unknown,
): RunLifecycleEvent['status'] {
  switch (value) {
    case 'created':
    case 'started':
    case 'updated':
    case 'completed':
    case 'errored':
    case 'cancelled':
      return value
    case 'success':
      return 'completed'
    case 'error':
      return 'errored'
    case 'idle':
      return 'created'
    default:
      return 'updated'
  }
}

function attachActivityRunToHook(
  state: HookRegistryState,
  hookId: string,
  runId: string,
): void {
  const hook = state.hooks[hookId]
  if (!hook || hook.activityRunIds.includes(runId)) return
  hook.activityRunIds.push(runId)
}

function attachEventToHook(
  state: HookRegistryState,
  hookId: string | undefined,
  eventId: string,
): void {
  if (!hookId) return
  const hook = state.hooks[hookId]
  if (!hook || hook.eventIds.includes(eventId)) return
  hook.eventIds.push(eventId)
}

function inferLifecycleFromSnapshot(
  state: Record<string, unknown>,
): HookLifecycle {
  if (state.status === 'error' || state.error) {
    return 'errored'
  }
  if (state.isLoading || state.status === 'generating') {
    return 'streaming'
  }
  return 'active'
}

function isTerminalRunStatus(status: RunLifecycleEvent['status']): boolean {
  return (
    status === 'completed' || status === 'errored' || status === 'cancelled'
  )
}
