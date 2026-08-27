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

export const SEEN_EVENT_IDS_CAP = 10_000

export interface HookRegistryState {
  hooks: Record<string, HookRecord>
  runs: Record<string, RunRecord>
  events: Record<string, TimelineEvent>
  fixtures: Array<ToolFixtureRecord>
  activeHookId: string | null
  seenEventIds: Record<string, true>
  seenEventIdOrder: Array<string>
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
    seenEventIdOrder: [],
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

type EventDedupeFields = Partial<AIDevtoolsEventEnvelope> & {
  runtimeId?: string
  timestamp?: number
}

function syntheticEventDedupeKey(
  eventName: string,
  event: EventDedupeFields,
): string {
  return [
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
}

function eventHasNoDedupeIdentity(event: EventDedupeFields): boolean {
  return (
    !event.source &&
    !event.visibility &&
    !event.runtimeId &&
    !event.hookId &&
    !event.clientId &&
    !event.threadId &&
    !event.runId &&
    !event.messageId &&
    !event.toolCallId &&
    !event.timestamp
  )
}

export function markEventSeen(
  state: HookRegistryState,
  eventName: string,
  event: EventDedupeFields,
): boolean {
  let key: string
  if (event.eventId) {
    key = event.eventId
  } else {
    key = syntheticEventDedupeKey(eventName, event)
    if (eventHasNoDedupeIdentity(event)) {
      console.warn(
        `[ai-devtools] dedupe key for "${eventName}" has no identifying fields; events may collide.`,
      )
    }
  }

  if (state.seenEventIds[key]) {
    return false
  }
  state.seenEventIds[key] = true
  state.seenEventIdOrder.push(key)
  if (state.seenEventIdOrder.length > SEEN_EVENT_IDS_CAP) {
    const evicted = state.seenEventIdOrder.shift()
    if (evicted !== undefined) {
      delete state.seenEventIds[evicted]
    }
  }
  return true
}

type HookEventHandler = (
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
) => void

function applyRegisteredHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
): void {
  const registered = event as HookRegisteredEvent
  delete state.unregisteredHookIds[registered.hookId]
  upsertHook(state, registered)
  attachEventToHook(state, registered.hookId, timelineEvent.id)
}

function applyUpdatedHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
): void {
  const updated = event as HookUpdatedEvent
  if (state.unregisteredHookIds[updated.hookId]) {
    return
  }
  if (isStaleHookInstanceEvent(state, updated.hookId, updated)) {
    return
  }
  upsertHook(state, updated)
  attachEventToHook(state, updated.hookId, timelineEvent.id)
}

function applyUnregisteredHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
): void {
  const unregistered = event as HookUnregisteredEvent
  const existing = state.hooks[unregistered.hookId]
  const hasDifferentClient =
    Boolean(existing?.clientId) &&
    Boolean(unregistered.clientId) &&
    existing?.clientId !== unregistered.clientId
  if (hasDifferentClient) {
    return
  }
  const hasDifferentCorrelation =
    Boolean(existing?.correlationId) &&
    Boolean(unregistered.correlationId) &&
    existing?.correlationId !== unregistered.correlationId
  if (hasDifferentCorrelation) {
    return
  }
  if (existing) {
    const isStaleUnregister = existing.registeredAt > unregistered.timestamp
    if (isStaleUnregister) {
      return
    }
  }
  state.unregisteredHookIds[unregistered.hookId] = true
  removeHookRecord(state, unregistered.hookId)
}

function applyStateSnapshotHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
): void {
  const snapshot = event as HookStateSnapshotEvent
  if (state.unregisteredHookIds[snapshot.hookId]) {
    return
  }
  if (isStaleHookInstanceEvent(state, snapshot.hookId, snapshot)) {
    return
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
  syncRunsFromSnapshot(state, snapshot, timelineEvent.id)
}

function applyToolsRegisteredHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
): void {
  const toolsEvent = event as ToolsRegisteredEvent
  if (state.unregisteredHookIds[toolsEvent.hookId]) {
    return
  }
  if (isStaleHookInstanceEvent(state, toolsEvent.hookId, toolsEvent)) {
    return
  }
  if (!toolsEvent.hookName) {
    console.warn(
      `[ai-devtools] tools:registered event for hook "${toolsEvent.hookId}" had no hookName; displaying raw hookId in the UI.`,
    )
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
}

function applyRunLifecycleHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
): void {
  const runEvent = event as RunLifecycleEvent
  const hookId = runEvent.hookId
  if (hookId) {
    const isUnregisteredHook = Boolean(state.unregisteredHookIds[hookId])
    if (isUnregisteredHook) {
      return
    }
    const isStaleHook = isStaleHookInstanceEvent(state, hookId, runEvent)
    if (isStaleHook) {
      return
    }
  }
  upsertRun(state, runEvent, timelineEvent.id)
  if (hookId) {
    upsertUnknownHook(state, hookId, runEvent)
    attachRunToHook(state, hookId, runEvent.runId)
    attachActivityRunToHook(state, hookId, runEvent.runId)
    attachEventToHook(state, hookId, timelineEvent.id)
  }
}

function applyToolFixtureHookEvent(
  state: HookRegistryState,
  event: RuntimeScopedHookEvent,
  timelineEvent: TimelineEvent,
): void {
  const fixtureEvent = event as DevtoolsToolFixtureApplyEvent
  if (fixtureEvent.hookId) {
    attachEventToHook(state, fixtureEvent.hookId, timelineEvent.id)
  }
}

const hookEventHandlers: Record<string, HookEventHandler> = {
  'hook:registered': applyRegisteredHookEvent,
  'hook:updated': applyUpdatedHookEvent,
  'hook:unregistered': applyUnregisteredHookEvent,
  'hook:state-snapshot': applyStateSnapshotHookEvent,
  'tools:registered': applyToolsRegisteredHookEvent,
  'run:created': applyRunLifecycleHookEvent,
  'run:started': applyRunLifecycleHookEvent,
  'run:updated': applyRunLifecycleHookEvent,
  'run:completed': applyRunLifecycleHookEvent,
  'run:errored': applyRunLifecycleHookEvent,
  'run:cancelled': applyRunLifecycleHookEvent,
  'devtools:tool-fixture:apply': applyToolFixtureHookEvent,
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

  const apply = hookEventHandlers[eventName]
  if (apply) apply(state, event, timelineEvent)

  const activeHookId = state.activeHookId
  if (activeHookId) {
    const isMissingActiveHook = !state.hooks[activeHookId]
    if (isMissingActiveHook) {
      state.activeHookId = null
    }
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
  state.seenEventIdOrder = []
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
  const hookEventIds = new Set(hook?.eventIds ?? [])

  const runEntries = Object.entries(state.runs)
  for (const [runId, run] of runEntries) {
    const shouldRemoveRun = run.hookId === hookId || hookRunIds.has(runId)
    if (shouldRemoveRun) {
      delete state.runs[runId]
    }
  }

  for (const eventId of hookEventIds) {
    delete state.events[eventId]
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
  if (!hook) return
  const hasRun = hook.runIds.includes(runId)
  if (hasRun) return
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
    const isInvalidRun = !candidate || typeof candidate !== 'object'
    if (isInvalidRun) continue
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
    if (status === null) {
      console.warn(
        `[ai-devtools] unknown run.status in snapshot for hook "${snapshot.hookId}": ${String(run.status)}; skipping run "${run.id}"`,
      )
      continue
    }
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
      } else {
        const shouldSetCompletedAt =
          isTerminalRunStatus(status) && !existing.completedAt
        if (shouldSetCompletedAt) {
          existing.completedAt = updatedAt
        }
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
): RunLifecycleEvent['status'] | null {
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
      return null
  }
}

function attachActivityRunToHook(
  state: HookRegistryState,
  hookId: string,
  runId: string,
): void {
  const hook = state.hooks[hookId]
  if (!hook) return
  const hasActivityRun = hook.activityRunIds.includes(runId)
  if (hasActivityRun) return
  hook.activityRunIds.push(runId)
}

function attachEventToHook(
  state: HookRegistryState,
  hookId: string | undefined,
  eventId: string,
): void {
  if (!hookId) return
  const hook = state.hooks[hookId]
  if (!hook) return
  const hasEvent = hook.eventIds.includes(eventId)
  if (hasEvent) return
  hook.eventIds.push(eventId)
}

function inferLifecycleFromSnapshot(
  state: Record<string, unknown>,
): HookLifecycle {
  const isErrored = state.status === 'error' || Boolean(state.error)
  if (isErrored) {
    return 'errored'
  }
  const isStreaming = Boolean(state.isLoading) || state.status === 'generating'
  if (isStreaming) {
    return 'streaming'
  }
  return 'active'
}

function isTerminalRunStatus(status: RunLifecycleEvent['status']): boolean {
  return (
    status === 'completed' || status === 'errored' || status === 'cancelled'
  )
}
