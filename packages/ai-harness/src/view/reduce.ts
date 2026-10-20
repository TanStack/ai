import { EventType } from '@tanstack/ai'
import { isMediaRecord, mediaIdOf, mediaOfMessage } from '../media-ref'
import { signInOf, waitKind } from '../waits'
import { HARNESS_EVENTS } from '../types'
import { addUsage } from '../usage'
import type { Interrupt, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { SessionDescription, SessionSnapshot } from '../session/index'
import type { PendingQuestion, SessionEvent } from '../types'
import type { UsageCall } from '../usage'
import type { PendingWait, Wait } from '../waits'
import type {
  AgentPart,
  Approval,
  ClientToolCall,
  MediaPart,
  NoticeKind,
  SessionViewState,
  SignIn,
  ToolCallPart,
  ViewAgent,
  ViewInterrupt,
  ViewMessage,
  ViewPart,
  ViewQuestion,
} from './types'

const COMMAND_RESULT = 'harness.command.result'

/** Events that change the parts of the current turn. */
const TURN_EVENTS: ReadonlySet<string> = new Set([
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_ARGS,
  EventType.TOOL_CALL_END,
  EventType.TOOL_CALL_RESULT,
  EventType.SUBAGENT_STARTED,
  EventType.SUBAGENT_FINISHED,
  EventType.SUBAGENT_ERROR,
])

/** Makes the items that carry actions. The view owns the actions. */
export interface ItemFactory {
  approval: (interrupt: Interrupt, call: ToolCallPart | undefined) => Approval
  clientTool: (
    interrupt: Interrupt,
    call: ToolCallPart | undefined,
  ) => ClientToolCall
  question: (question: PendingQuestion) => ViewQuestion
  interrupt: (interrupt: Interrupt) => ViewInterrupt
  agent: (operation: {
    id: string
    name: string
    status: ViewAgent['status']
  }) => ViewAgent
}

/** The state of a view before it reads anything from its session. */
export function emptyState(): SessionViewState {
  return {
    threadId: '',
    status: 'idle',
    connection: 'open',
    messages: [],
    approvals: [],
    clientTools: [],
    interrupts: [],
    questions: [],
    signIns: [],
    waits: [],
    agents: [],
    queuedTurns: 0,
    waitingInputs: [],
    commands: [],
    config: [],
    tools: [],
    models: [],
    plugins: {},
  }
}

function parseJson(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function textOf(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content
  if (!content) return ''
  return content
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')
}

export function subagentOf(event: StreamChunk): string | undefined {
  return 'subagentRunId' in event && typeof event.subagentRunId === 'string'
    ? event.subagentRunId
    : undefined
}

/** Custom event values and snapshots are plain JSON objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** The fields of a media part that come from its record. */
type MediaInfo = Omit<MediaPart, 'type' | 'url' | 'load'>

// ponytail: the reducer keeps only data. The view swaps this `load` for one
// that reads from its source, and adds the `url`.
const notInView = () =>
  Promise.reject(new Error('Only a session view can load media bytes.'))

function mediaView(media: MediaInfo) {
  const part: MediaPart = {
    type: 'media',
    id: media.id,
    kind: media.kind,
    mimeType: media.mimeType,
    name: media.name,
    size: media.size,
    load: notInView,
  }
  return part
}

/**
 * Media parts for the `harness-media:` parts of a saved user message. The
 * name and size come from the records in `metadata.harness.media`.
 */
function userMedia(message: ModelMessage) {
  const { content } = message
  if (typeof content === 'string' || !content) return []
  const records = mediaOfMessage(message)
  return content.flatMap((part) => {
    const id = mediaIdOf(part)
    if (id === undefined || part.type === 'text') return []
    // A message saved without the records keeps only the id and MIME type of
    // a part, so the name is the id and the size is 0.
    const record = records.find((media) => media.id === id) ?? {
      id,
      kind: part.type,
      mimeType: part.source.mimeType ?? '',
      name: id,
      size: 0,
    }
    return [mediaView(record)]
  })
}

/** The notice for a `session.reset()`: the model starts again from here. */
function resetNotice(note: unknown) {
  return typeof note === 'string'
    ? `The context was reset. The model starts from this note: ${note}`
    : 'The context was reset. The model sees only what comes after this.'
}

/** The notice text for a refused input. */
export const notAccepted = (reason: unknown) =>
  `Not accepted: ${String(reason ?? 'unknown reason')}`

/** Add a notice line at the end of the messages. */
export function withNotice(
  state: SessionViewState,
  kind: NoticeKind,
  text: string,
): SessionViewState {
  const message: ViewMessage = {
    id: `notice-${state.messages.length}`,
    role: 'notice',
    kind,
    text,
  }
  return { ...state, messages: [...state.messages, message] }
}

/** Add a user message, with the files the user sent, at the end of the messages. */
export function withUserMessage(
  state: SessionViewState,
  text: string,
  media: ReadonlyArray<MediaInfo> = [],
): SessionViewState {
  const message: ViewMessage = {
    id: `user-${state.messages.length}`,
    role: 'user',
    text,
    ...(media.length > 0 ? { media: media.map(mediaView) } : {}),
  }
  return { ...state, messages: [...state.messages, message] }
}

function appendText(
  parts: Array<ViewPart>,
  type: 'text' | 'reasoning',
  delta: string,
): Array<ViewPart> {
  if (delta === '') return parts
  const last = parts.at(-1)
  if (last?.type === type) {
    // One copy of the parts: the last part changes, the others stay.
    const next = [...parts]
    next[next.length - 1] = { type, text: last.text + delta }
    return next
  }
  return [...parts, { type, text: delta }]
}

function mapToolCall(
  parts: Array<ViewPart>,
  id: string,
  change: (call: ToolCallPart) => ToolCallPart,
): Array<ViewPart> {
  const index = parts.findIndex(
    (part) => part.type === 'tool-call' && part.id === id,
  )
  const part = parts[index]
  if (part?.type !== 'tool-call') return parts
  const next = [...parts]
  next[index] = change(part)
  return next
}

function findAgent(
  parts: ReadonlyArray<ViewPart>,
  id: string,
): AgentPart | undefined {
  for (const part of parts) {
    if (part.type !== 'agent') continue
    if (part.id === id) return part
    const inner = findAgent(part.parts, id)
    if (inner) return inner
  }
  return undefined
}

function mapAgent(
  parts: Array<ViewPart>,
  id: string,
  change: (agent: AgentPart) => AgentPart,
): Array<ViewPart> {
  let found = false
  let changed = false
  const next = parts.map((part) => {
    if (part.type !== 'agent' || found) return part
    if (part.id === id) {
      found = true
      const updated = change(part)
      if (updated !== part) changed = true
      return updated
    }
    const inner = mapAgent(part.parts, id, change)
    if (inner === part.parts) return part
    found = true
    changed = true
    return { ...part, parts: inner }
  })
  return changed ? next : parts
}

/** Text, reasoning, and tool call events of one agent (the lead or a child). */
function applyOwn(parts: Array<ViewPart>, event: StreamChunk): Array<ViewPart> {
  // Each model call gets its own text part, so a retry can drop one call.
  if (event.type === EventType.TEXT_MESSAGE_START)
    return parts.at(-1)?.type === 'text'
      ? [...parts, { type: 'text', text: '' }]
      : parts
  if (event.type === EventType.TEXT_MESSAGE_CONTENT)
    return appendText(parts, 'text', event.delta)
  if (event.type === EventType.REASONING_MESSAGE_CONTENT)
    return appendText(parts, 'reasoning', event.delta)
  if (event.type === EventType.TOOL_CALL_START) {
    if (
      parts.some(
        (part) => part.type === 'tool-call' && part.id === event.toolCallId,
      )
    )
      return parts
    return [
      ...parts,
      {
        type: 'tool-call',
        id: event.toolCallId,
        name: event.toolCallName,
        argsText: '',
        args: undefined,
        status: 'running',
      },
    ]
  }
  if (event.type === EventType.TOOL_CALL_ARGS)
    return mapToolCall(parts, event.toolCallId, (call) => ({
      ...call,
      argsText: call.argsText + event.delta,
    }))
  if (event.type === EventType.TOOL_CALL_END)
    return mapToolCall(parts, event.toolCallId, (call) => ({
      ...call,
      // An adapter can send the parsed input with no ARGS deltas.
      args:
        call.argsText === '' && event.input !== undefined
          ? event.input
          : parseJson(call.argsText),
    }))
  if (event.type === EventType.TOOL_CALL_RESULT)
    return mapToolCall(parts, event.toolCallId, (call) => ({
      ...call,
      // A failed call shows as failed live too, as it does from the transcript.
      status:
        recordOf(recordOf(event.metadata).tanstack).state === 'output-error'
          ? 'failed'
          : 'done',
      // Content parts (a multimodal result) stay as they are.
      result:
        typeof event.content === 'string'
          ? parseJson(event.content)
          : event.content,
    }))
  return parts
}

/** Route an event to the lead's parts or to the child agent it belongs to. */
function applyToParts(
  parts: Array<ViewPart>,
  event: StreamChunk,
): Array<ViewPart> {
  const child = subagentOf(event)
  if (child === undefined) return applyOwn(parts, event)
  if (event.type === EventType.SUBAGENT_STARTED) {
    if (findAgent(parts, child)) return parts
    const agent: AgentPart = {
      type: 'agent',
      id: child,
      name: event.name ?? 'agent',
      status: 'running',
      parts: [],
    }
    const parent = event.parentSubagentRunId
    if (parent !== undefined && findAgent(parts, parent)) {
      return mapAgent(parts, parent, (owner) => ({
        ...owner,
        parts: [...owner.parts, agent],
      }))
    }
    return [...parts, agent]
  }
  return mapAgent(parts, child, (agent) => applyToChild(agent, event))
}

/** One event of a child agent, on its part. */
function applyToChild(agent: AgentPart, event: StreamChunk): AgentPart {
  if (event.type === EventType.SUBAGENT_STARTED)
    return agent.status === 'running' ? agent : { ...agent, status: 'running' }
  if (event.type === EventType.SUBAGENT_FINISHED) {
    const { result } = event
    return {
      ...agent,
      status: 'done',
      ...(result !== undefined ? { result } : {}),
    }
  }
  if (event.type === EventType.SUBAGENT_ERROR)
    return { ...agent, status: 'failed', error: event.message }
  const inner = applyOwn(agent.parts, event)
  return inner === agent.parts ? agent : { ...agent, parts: inner }
}

/**
 * An event of a child that the turn does not show, on the part of the
 * message that does: a background child that a saved message shows.
 */
function applyToShownChild(
  state: SessionViewState,
  child: string,
  event: StreamChunk,
): SessionViewState {
  const messages = keep(
    state.messages,
    state.messages.map((message) => {
      if (message.role !== 'assistant') return message
      const parts = mapAgent(message.parts, child, (agent) =>
        applyToChild(agent, event),
      )
      return parts === message.parts ? message : { ...message, parts }
    }),
  )
  return messages === state.messages ? state : { ...state, messages }
}

/**
 * The index of the last assistant message of one turn: `turn-<id>`, or a
 * message that a handoff in the turn started (`turn-<id>:<n>`).
 */
function turnIndex(state: SessionViewState, operationId: string) {
  const id = `turn-${operationId}`
  return state.messages.findLastIndex(
    (message) => message.id === id || message.id.startsWith(`${id}:`),
  )
}

/** Change the assistant message of one turn. It is created on its first part. */
function updateTurn(
  state: SessionViewState,
  operationId: string,
  change: (parts: Array<ViewPart>) => Array<ViewPart>,
): SessionViewState {
  const index = turnIndex(state, operationId)
  const current = state.messages[index]
  const parts = current?.role === 'assistant' ? current.parts : []
  const next = change(parts)
  if (next === parts) return state
  const message: ViewMessage =
    current?.role === 'assistant'
      ? { ...current, parts: next }
      : { id: `turn-${operationId}`, role: 'assistant', parts: next }
  if (index < 0) return { ...state, messages: [...state.messages, message] }
  const messages = [...state.messages]
  messages[index] = message
  return { ...state, messages }
}

/**
 * Name the agent that writes the rest of one turn. A turn message with parts
 * keeps its agent, and a new message starts. `agent` is `undefined` for the
 * main model.
 */
function withTurnAgent(
  state: SessionViewState,
  operationId: string,
  agent: string | undefined,
): SessionViewState {
  const index = turnIndex(state, operationId)
  const current = state.messages[index]
  const named = agent !== undefined ? { agent } : {}
  if (current?.role === 'assistant' && current.parts.length === 0) {
    if (current.agent === agent) return state
    const message: ViewMessage = {
      id: current.id,
      role: 'assistant',
      parts: [],
      ...named,
    }
    return { ...state, messages: state.messages.with(index, message) }
  }
  const id =
    index < 0
      ? `turn-${operationId}`
      : `turn-${operationId}:${state.messages.length}`
  const message: ViewMessage = { id, role: 'assistant', parts: [], ...named }
  return { ...state, messages: [...state.messages, message] }
}

/**
 * The parts without what the model call that failed streamed: its running
 * tool calls, its text part, and the reasoning before that text. The text of
 * an earlier call is a part of its own, so it stays.
 */
function withoutAttempt(parts: Array<ViewPart>): Array<ViewPart> {
  // ponytail: a failed call that streamed no text also drops the text of
  // the call before it. Mark where each model call starts if that matters.
  let end = parts.length
  const at = (index: number) => parts[index - 1]
  const isRunning = (part: ViewPart | undefined) =>
    part?.type === 'tool-call' && part.status === 'running'
  while (end > 0 && isRunning(at(end))) end -= 1
  if (at(end)?.type === 'text') end -= 1
  while (end > 0 && at(end)?.type === 'reasoning') end -= 1
  return end === parts.length ? parts : parts.slice(0, end)
}

function addMedia(parts: Array<ViewPart>, part: MediaPart) {
  const isShown = parts.some(
    (item) => item.type === 'media' && item.id === part.id,
  )
  return isShown ? parts : [...parts, part]
}

/** Media goes in the agent part of the child that made it, else in the lead parts. */
function withMedia(
  state: SessionViewState,
  operationId: string,
  media: MediaInfo,
  child: string | undefined,
) {
  const part = mediaView(media)
  return updateTurn(state, operationId, (parts) => {
    if (child === undefined || !findAgent(parts, child))
      return addMedia(parts, part)
    return mapAgent(parts, child, (agent) => {
      const inner = addMedia(agent.parts, part)
      return inner === agent.parts ? agent : { ...agent, parts: inner }
    })
  })
}

/** A lead tool result can come in a later turn (after an approval). */
function applyToolResult(
  state: SessionViewState,
  event: StreamChunk,
): SessionViewState {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index]
    if (message?.role !== 'assistant') continue
    const parts = applyOwn(message.parts, event)
    if (parts === message.parts) continue
    const messages = [...state.messages]
    messages[index] = { ...message, parts }
    return { ...state, messages }
  }
  return state
}

function failRunning(
  state: SessionViewState,
  operationId: string,
): SessionViewState {
  return updateTurn(state, operationId, (parts) =>
    parts.some((part) => part.type === 'tool-call' && part.status === 'running')
      ? parts.map((part) =>
          part.type === 'tool-call' && part.status === 'running'
            ? { ...part, status: 'failed' }
            : part,
        )
      : parts,
  )
}

/**
 * Add the call of a `harness.usage` event to the usage. Only the next call
 * adds: a replayed call is in the usage already. The view reads the usage
 * again when a call was missed.
 */
function withUsage(
  state: SessionViewState,
  value: Record<string, unknown>,
): SessionViewState {
  const { usage } = state
  const total = recordOf(value.total)
  const isNext = usage !== undefined && total.calls === usage.total.calls + 1
  if (!isNext || typeof value.model !== 'string' || !isRecord(value.usage))
    return state
  const next = structuredClone(usage)
  addUsage(next, {
    model: value.model,
    ...(typeof value.sender === 'string' ? { user: { id: value.sender } } : {}),
    // A plugin, router, or transfer call names its source; keep it so
    // `bySource` stays correct.
    ...(typeof value.source === 'string' ? { source: value.source } : {}),
    // The harness sends the counts of `UsageCall['usage']`.
    usage: value.usage as UsageCall['usage'],
  })
  return { ...state, usage: next }
}

function withSignIn(state: SessionViewState, signIn: SignIn): SessionViewState {
  return {
    ...state,
    signIns: [
      ...state.signIns.filter((item) => item.connector !== signIn.connector),
      signIn,
    ],
  }
}

function withConfigValue(
  state: SessionViewState,
  key: string,
  value: unknown,
): SessionViewState {
  if (!state.config.some((entry) => entry.key === key)) return state
  return {
    ...state,
    config: state.config.map((entry) =>
      entry.key === key ? { ...entry, value } : entry,
    ),
  }
}

/** Fold one session event into the state. Returns `state` when nothing changes. */
export function applyEvent(
  state: SessionViewState,
  entry: SessionEvent,
): SessionViewState {
  const { event, operationId } = entry
  if (
    event.type === EventType.TOOL_CALL_RESULT &&
    subagentOf(event) === undefined
  )
    return applyToolResult(state, event)
  if (TURN_EVENTS.has(event.type)) {
    const updated = updateTurn(state, operationId, (parts) =>
      applyToParts(parts, event),
    )
    // The start of a root agent that the router picked carries the plan of
    // the router. That agent writes the message of the turn.
    const isRouted =
      event.type === EventType.SUBAGENT_STARTED &&
      event.parentSubagentRunId === undefined &&
      recordOf(recordOf(event.metadata).tanstack).subagentPlan !== undefined
    const turnMessage = updated.messages[turnIndex(updated, operationId)]
    const next =
      isRouted &&
      turnMessage?.role === 'assistant' &&
      turnMessage.agent === undefined
        ? {
            ...updated,
            messages: updated.messages.map((message) =>
              message === turnMessage
                ? { ...turnMessage, agent: event.name }
                : message,
            ),
          }
        : updated
    const child = subagentOf(event)
    const isElsewhere =
      next === state &&
      child !== undefined &&
      event.type !== EventType.SUBAGENT_STARTED
    return isElsewhere ? applyToShownChild(state, child, event) : next
  }
  if (event.type === EventType.RUN_ERROR) {
    if (subagentOf(event) !== undefined) return state
    return failRunning(
      withNotice(state, 'error', `Error: ${event.message}`),
      operationId,
    )
  }
  if (event.type === EventType.STATE_SNAPSHOT) {
    const snapshot = recordOf(event.snapshot)
    return 'plugins' in snapshot
      ? { ...state, plugins: recordOf(snapshot.plugins) }
      : state
  }
  if (event.type !== EventType.CUSTOM) return state
  const value = recordOf(event.value)
  if (event.name === HARNESS_EVENTS.media)
    return isMediaRecord(value)
      ? withMedia(state, operationId, value, value.subagentRunId)
      : state
  if (event.name === HARNESS_EVENTS.usage) return withUsage(state, value)
  if (event.name === HARNESS_EVENTS.operationResumed)
    return withNotice(state, 'info', 'Resumed a turn that a crash stopped.')
  // A retry that does not continue the partial answer starts the model call
  // again, so the text of the failed attempt goes.
  if (event.name === HARNESS_EVENTS.turnRetry && value.continued !== true)
    return updateTurn(state, String(value.operationId), withoutAttempt)
  if (event.name === COMMAND_RESULT) {
    // A finished `connect:<id>` ends the sign-in it waited for.
    const connector =
      typeof value.name === 'string'
        ? /^connect:(.+)$/.exec(value.name)?.[1]
        : undefined
    const signedIn = connector
      ? {
          ...state,
          signIns: state.signIns.filter((item) => item.connector !== connector),
        }
      : state
    return typeof value.result === 'string' && value.result !== ''
      ? withNotice(signedIn, 'command', value.result)
      : signedIn
  }
  if (event.name === HARNESS_EVENTS.inputRejected)
    return withNotice(state, 'rejected', notAccepted(value.reason))
  if (event.name === HARNESS_EVENTS.reset)
    return withNotice(state, 'info', resetNotice(value.note))
  // A handoff to a person ends the turn, and the hand-back of an operator
  // comes on the session feed: neither has a message that an agent writes.
  if (
    event.name === HARNESS_EVENTS.handoff &&
    (typeof value.to === 'string' || value.to === null) &&
    operationId !== 'session'
  )
    return withTurnAgent(
      state,
      operationId,
      typeof value.to === 'string' ? value.to : undefined,
    )
  if (
    event.name === HARNESS_EVENTS.authRequired &&
    typeof value.connector === 'string'
  ) {
    return withSignIn(state, {
      connector: value.connector,
      ...(typeof value.url === 'string' ? { url: value.url } : {}),
      ...(typeof value.userCode === 'string'
        ? { userCode: value.userCode }
        : {}),
    })
  }
  if (
    event.name === HARNESS_EVENTS.configChanged &&
    typeof value.key === 'string'
  )
    return withConfigValue(state, value.key, value.value)
  const isChatStart =
    event.name === HARNESS_EVENTS.operationStarted && value.kind === 'chat'
  if (isChatStart && state.signIns.length > 0) return { ...state, signIns: [] }
  return state
}

/** The tool call `id` in `parts`, also in the parts of child agents. */
function findCallIn(
  parts: ReadonlyArray<ViewPart>,
  id: string,
): ToolCallPart | undefined {
  for (const part of parts) {
    if (part.type === 'tool-call' && part.id === id) return part
    if (part.type !== 'agent') continue
    const inner = findCallIn(part.parts, id)
    if (inner) return inner
  }
  return undefined
}

function findToolCall(
  messages: ReadonlyArray<ViewMessage>,
  id: string | undefined,
): ToolCallPart | undefined {
  if (id === undefined) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const part = findCallIn(message.parts, id)
    if (part) return part
  }
  return undefined
}

/** Mark the running calls in `waiting` as `needs-approval`, also in child agents. */
function markParts(
  parts: Array<ViewPart>,
  waiting: ReadonlySet<string>,
): Array<ViewPart> {
  return keep(
    parts,
    parts.map((part) => {
      if (part.type === 'agent') {
        const inner = markParts(part.parts, waiting)
        return inner === part.parts ? part : { ...part, parts: inner }
      }
      const isWaiting =
        part.type === 'tool-call' &&
        part.status === 'running' &&
        waiting.has(part.id)
      return isWaiting ? { ...part, status: 'needs-approval' as const } : part
    }),
  )
}

function markWaiting(
  messages: Array<ViewMessage>,
  waiting: ReadonlySet<string>,
): Array<ViewMessage> {
  if (waiting.size === 0) return messages
  return keep(
    messages,
    messages.map((message) => {
      if (message.role !== 'assistant') return message
      const parts = markParts(message.parts, waiting)
      return parts === message.parts ? message : { ...message, parts }
    }),
  )
}

/** `old` when `next` holds the same items, so selectors see no change. */
export function keep<T>(old: Array<T>, next: Array<T>): Array<T> {
  return old.length === next.length &&
    old.every((item, index) => item === next[index])
    ? old
    : next
}

/**
 * The interrupt that a view item of the wait `wait` shows: a wait of a
 * background agent run has no interrupt in the snapshot.
 */
/** A question wait of the log, as a question item takes it. */
function questionOfWait(wait: PendingWait): PendingQuestion {
  return {
    questionId: wait.waitId,
    message: wait.message ?? '',
    ...(wait.schema !== undefined ? { schema: wait.schema } : {}),
    ...(wait.secret ? { secret: true } : {}),
    ...(wait.url ? { url: wait.url } : {}),
  }
}

function interruptOfWait(wait: Wait): Interrupt {
  return {
    id: wait.waitId,
    reason: wait.kind,
    ...(wait.message !== undefined ? { message: wait.message } : {}),
    ...(isRecord(wait.schema) ? { responseSchema: wait.schema } : {}),
    ...(wait.expiresAt !== undefined
      ? { expiresAt: new Date(wait.expiresAt).toISOString() }
      : {}),
  }
}

/**
 * Take status, approvals, client tools, questions, waits, background agents,
 * and waiting inputs from a snapshot. Plugin state is taken only for the first
 * snapshot. Later changes come as `STATE_SNAPSHOT` events. Returns `state`
 * when nothing changes.
 */
export function applySnapshot(
  state: SessionViewState,
  snapshot: SessionSnapshot,
  factory: ItemFactory,
  options: { initial?: boolean } = {},
): SessionViewState {
  const { pendingWaits } = snapshot
  const turnInterrupts = pendingWaits.flatMap(({ interrupt, turn }) =>
    interrupt && turn ? [interrupt] : [],
  )
  // The waits that no turn holds and that are no question: the waits of
  // background agent runs. Each one is an item of its kind, answered on its
  // own.
  const runWaits = pendingWaits.filter(
    ({ turn, kind }) => !turn && kind !== 'question',
  )
  const items = [
    ...turnInterrupts.map((interrupt) => ({
      interrupt,
      kind: waitKind(interrupt),
    })),
    ...runWaits.map((wait) => ({
      interrupt: interruptOfWait(wait),
      kind: wait.kind,
    })),
  ]
  const ofKind = (...kinds: Array<Wait['kind']>) =>
    items.flatMap(({ interrupt, kind }) =>
      kinds.includes(kind) ? [interrupt] : [],
    )
  const approvals = keep(
    state.approvals,
    ofKind('approval').map(
      (interrupt) =>
        state.approvals.find((item) => item.id === interrupt.id) ??
        factory.approval(
          interrupt,
          findToolCall(state.messages, interrupt.toolCallId),
        ),
    ),
  )
  const clientTools = keep(
    state.clientTools,
    ofKind('client-tool').map(
      (interrupt) =>
        state.clientTools.find((item) => item.id === interrupt.id) ??
        factory.clientTool(
          interrupt,
          findToolCall(state.messages, interrupt.toolCallId),
        ),
    ),
  )
  const interrupts = keep(
    state.interrupts,
    // An interrupt that waits for an answer of its own shape.
    ofKind('question', 'human').map(
      (interrupt) =>
        state.interrupts.find((item) => item.id === interrupt.id) ??
        factory.interrupt(interrupt),
    ),
  )
  const waits = keep(
    state.waits,
    pendingWaits.map(
      (wait) => state.waits.find((item) => item.waitId === wait.waitId) ?? wait,
    ),
  )
  // Usage changes only with a new model call.
  const usage =
    state.usage?.total.calls === snapshot.usage.total.calls
      ? state.usage
      : snapshot.usage
  // In the snapshot too, so a sign-in that a turn waits for shows after a reload.
  const newSignIns = turnInterrupts
    .flatMap((interrupt) => signInOf(interrupt) ?? [])
    .filter(
      (signIn) =>
        !state.signIns.some((item) => item.connector === signIn.connector),
    )
  const signIns =
    newSignIns.length > 0 ? [...state.signIns, ...newSignIns] : state.signIns
  const questions = keep(
    state.questions,
    pendingWaits.flatMap((wait) =>
      wait.turn || wait.kind !== 'question'
        ? []
        : [
            state.questions.find((item) => item.id === wait.waitId) ??
              factory.question(questionOfWait(wait)),
          ],
    ),
  )
  // A background run with an open wait waits for its answer.
  const waitingRuns = new Set(pendingWaits.map(({ runId }) => runId))
  const agents = keep(
    state.agents,
    snapshot.activeOperations
      .filter((operation) => operation.kind === 'agent')
      .map((operation) => {
        const status = waitingRuns.has(operation.id) ? 'waiting' : 'running'
        return (
          state.agents.find(
            (item) => item.id === operation.id && item.status === status,
          ) ??
          factory.agent({
            id: operation.id,
            name: operation.agent ?? 'agent',
            status,
          })
        )
      }),
  )
  const waitingInputs = keep(
    state.waitingInputs,
    (snapshot.waitingInputs ?? []).map(
      (input) =>
        state.waitingInputs.find(
          (item) =>
            item.inputId === input.inputId && item.delivery === input.delivery,
        ) ?? input,
    ),
  )
  const waiting = new Set(
    approvals.flatMap((item) => (item.toolCallId ? [item.toolCallId] : [])),
  )
  const messages = markWaiting(state.messages, waiting)
  const plugins = options.initial ? snapshot.plugins : state.plugins
  const isSame =
    snapshot.threadId === state.threadId &&
    snapshot.status === state.status &&
    snapshot.queuedTurns === state.queuedTurns &&
    waitingInputs === state.waitingInputs &&
    approvals === state.approvals &&
    clientTools === state.clientTools &&
    interrupts === state.interrupts &&
    usage === state.usage &&
    signIns === state.signIns &&
    questions === state.questions &&
    waits === state.waits &&
    agents === state.agents &&
    messages === state.messages &&
    plugins === state.plugins
  if (isSame) return state
  return {
    ...state,
    threadId: snapshot.threadId,
    status: snapshot.status,
    queuedTurns: snapshot.queuedTurns,
    waitingInputs,
    approvals,
    clientTools,
    interrupts,
    usage,
    signIns,
    questions,
    waits,
    agents,
    messages,
    plugins,
  }
}

/** Take the commands, config entries, and tools from a session description. */
export function applyDescription(
  state: SessionViewState,
  description: SessionDescription,
): SessionViewState {
  return {
    ...state,
    commands: description.commands,
    config: description.config,
    tools: description.tools,
    models: description.models ?? [],
    settings: description.settings,
  }
}

/**
 * Messages for a saved transcript. Tool results fill in their tool calls.
 * The media a turn made (`metadata.harness.media`) goes at the end of its
 * assistant message. `metadata.harness.agent` is its `agent`.
 */
export function messagesFromTranscript(
  messages: ReadonlyArray<ModelMessage>,
): Array<ViewMessage> {
  const result: Array<ViewMessage> = []
  messages.forEach((message, index) => {
    const id = message.id ?? `history-${index}`
    const harness = recordOf(message.metadata?.harness)
    // The harness sent a wake message (a background job ended), not the
    // user. The live view never showed it, so a reload does not either.
    if (message.role === 'user' && harness.wake === true) return
    // The note of a 'continue' retry is from the harness too.
    const tanstack = recordOf(message.metadata?.tanstack)
    if (message.role === 'user' && tanstack.synthetic === true) return
    // The marker of a `session.reset()` shows as a notice, not a message.
    const reset = harness.reset
    if (message.role === 'user' && isRecord(reset)) {
      result.push({
        id,
        role: 'notice',
        kind: 'info',
        text: resetNotice(reset.note),
      })
      return
    }
    // The files of an operator reply: they show with the reply.
    if (message.role === 'user' && harness.operatorAttachment === true) {
      const media = userMedia(message)
      const reply = result.find(
        (item) => `${item.id}:media` === id && item.role === 'assistant',
      )
      if (reply?.role === 'assistant') reply.parts.push(...media)
      else result.push({ id, role: 'assistant', parts: media })
      return
    }
    if (message.role === 'user') {
      const media = userMedia(message)
      result.push({
        id,
        role: 'user',
        text: textOf(message.content),
        ...(media.length > 0 ? { media } : {}),
      })
      return
    }
    if (message.role === 'assistant') {
      const parts: Array<ViewPart> = []
      const thoughts = message.thinking ?? []
      for (const thought of thoughts)
        parts.push({ type: 'reasoning', text: thought.content })
      const text = textOf(message.content)
      if (text !== '') parts.push({ type: 'text', text })
      const calls = message.toolCalls ?? []
      for (const call of calls) {
        parts.push({
          type: 'tool-call',
          id: call.id,
          name: call.function.name,
          argsText: call.function.arguments,
          args: parseJson(call.function.arguments),
          status: 'running',
        })
      }
      const media = mediaOfMessage(message)
      for (const record of media) parts.push(mediaView(record))
      // The root agent that wrote it, in a harness with `routing`.
      const agent =
        typeof harness.agent === 'string' ? harness.agent : undefined
      result.push({
        id,
        role: 'assistant',
        parts,
        ...(agent !== undefined ? { agent } : {}),
      })
      return
    }
    // A tool message holds the result of an earlier tool call. The list is
    // new here, so it is safe to change in place.
    const call = findToolCall(result, message.toolCallId)
    if (!call) return
    call.status = message.error ? 'failed' : 'done'
    call.result = parseJson(textOf(message.content))
    // An agent tool result names its child run. The view loads the child's
    // own messages into this part.
    const outcome = recordOf(call.result)
    const child = outcome.subagentRunId
    if (typeof child !== 'string' || child === '') return
    const owner = result.find(
      (item) => item.role === 'assistant' && item.parts.includes(call),
    )
    if (owner?.role !== 'assistant') return
    const error = outcome.error
    // A background child answers at once with `status: 'started'`.
    const isStarted = recordOf(outcome.result).status === 'started'
    const ended =
      error === undefined && call.status === 'done' ? 'done' : 'failed'
    const agent: AgentPart = {
      type: 'agent',
      id: child,
      name: call.name,
      status: isStarted ? 'running' : ended,
      ...(typeof error === 'string' ? { error } : {}),
      parts: [],
    }
    owner.parts.splice(owner.parts.indexOf(call) + 1, 0, agent)
  })
  return result
}

/** The parts of a child agent from its saved messages. Its task does not show. */
export function agentPartsFrom(
  messages: ReadonlyArray<ModelMessage>,
): Array<ViewPart> {
  return messagesFromTranscript(messages).flatMap((message) =>
    message.role === 'assistant' ? message.parts : [],
  )
}

/** The agent parts that show no parts yet. */
function emptyAgents(parts: ReadonlyArray<ViewPart>): Array<AgentPart> {
  return parts.flatMap((part) => {
    if (part.type !== 'agent') return []
    return part.parts.length === 0 ? [part] : emptyAgents(part.parts)
  })
}

/** `emptyAgents` of every assistant message. */
export function emptyAgentsIn(
  messages: ReadonlyArray<ViewMessage>,
): Array<AgentPart> {
  return messages.flatMap((message) =>
    message.role === 'assistant' ? emptyAgents(message.parts) : [],
  )
}

/**
 * Put `parts` first in the agent part `id`, in whichever message holds it.
 * `ended` is how the saved child ended. It changes a part that shows the
 * child as running, from a background start.
 */
export function withAgentParts(
  state: SessionViewState,
  id: string,
  parts: Array<ViewPart>,
  ended?: AgentPart['status'],
): SessionViewState {
  const messages = keep(
    state.messages,
    state.messages.map((message) => {
      if (message.role !== 'assistant') return message
      // Events can come before the saved messages load. They come after them.
      const next = mapAgent(message.parts, id, (agent) => {
        const status =
          agent.status === 'running' && ended ? ended : agent.status
        if (parts.length === 0 && status === agent.status) return agent
        return { ...agent, status, parts: [...parts, ...agent.parts] }
      })
      return next === message.parts ? message : { ...message, parts: next }
    }),
  )
  return messages === state.messages ? state : { ...state, messages }
}

/**
 * The message, tool call, and child run ids of a saved transcript. A segment
 * of a message (`<id>-segment-<n>`) has the id of its stream message.
 */
export function transcriptIds(
  messages: ReadonlyArray<ModelMessage>,
): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.id) ids.add(message.id.replace(/-segment-\d+$/, ''))
    for (const call of message.toolCalls ?? []) ids.add(call.id)
    // The child run an agent tool result names: its parts load on their own.
    if (message.role !== 'tool') continue
    const child = recordOf(parseJson(textOf(message.content))).subagentRunId
    if (typeof child === 'string' && child !== '') ids.add(child)
  }
  return ids
}
