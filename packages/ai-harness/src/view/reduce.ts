import { EventType, readUnopenedInterruptBinding } from '@tanstack/ai'
import { isMediaRecord, mediaIdOf, mediaOfMessage } from '../media-ref'
import { HARNESS_EVENTS } from '../types'
import type { Interrupt, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { SessionDescription, SessionSnapshot } from '../session'
import type { SessionEvent } from '../types'
import type {
  AgentPart,
  Approval,
  ClientToolCall,
  MediaPart,
  NoticeKind,
  SessionViewState,
  SignIn,
  ToolCallPart,
  ViewMessage,
  ViewPart,
  ViewQuestion,
} from './types'

const COMMAND_RESULT = 'harness.command.result'

/** Events that change the parts of the current turn. */
const TURN_EVENTS: ReadonlySet<string> = new Set([
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
  question: (
    question: SessionSnapshot['pendingQuestions'][number],
  ) => ViewQuestion
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
    questions: [],
    signIns: [],
    agents: [],
    queuedTurns: 0,
    commands: [],
    config: [],
    tools: [],
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

function subagentOf(event: StreamChunk): string | undefined {
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
    return [...parts.slice(0, -1), { type, text: last.text + delta }]
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
      args: parseJson(call.argsText),
    }))
  if (event.type === EventType.TOOL_CALL_RESULT)
    return mapToolCall(parts, event.toolCallId, (call) => ({
      ...call,
      status: 'done',
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
  return mapAgent(parts, child, (agent) => {
    if (event.type === EventType.SUBAGENT_FINISHED)
      return { ...agent, status: 'done' }
    if (event.type === EventType.SUBAGENT_ERROR)
      return { ...agent, status: 'failed', error: event.message }
    const inner = applyOwn(agent.parts, event)
    return inner === agent.parts ? agent : { ...agent, parts: inner }
  })
}

/** Change the assistant message of one turn. It is created on its first part. */
function updateTurn(
  state: SessionViewState,
  operationId: string,
  change: (parts: Array<ViewPart>) => Array<ViewPart>,
): SessionViewState {
  const id = `turn-${operationId}`
  const index = state.messages.findLastIndex((message) => message.id === id)
  const current = state.messages[index]
  const parts = current?.role === 'assistant' ? current.parts : []
  const next = change(parts)
  if (next === parts) return state
  const message: ViewMessage = { id, role: 'assistant', parts: next }
  if (index < 0) return { ...state, messages: [...state.messages, message] }
  const messages = [...state.messages]
  messages[index] = message
  return { ...state, messages }
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
  if (TURN_EVENTS.has(event.type))
    return updateTurn(state, operationId, (parts) => applyToParts(parts, event))
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
  if (event.name === HARNESS_EVENTS.operationResumed)
    return withNotice(state, 'info', 'Resumed a turn that a crash stopped.')
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
    return withNotice(
      state,
      'rejected',
      `Not accepted: ${String(value.reason ?? 'unknown reason')}`,
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

function findToolCall(
  messages: ReadonlyArray<ViewMessage>,
  id: string | undefined,
): ToolCallPart | undefined {
  if (id === undefined) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const part = message.parts.find(
      (item) => item.type === 'tool-call' && item.id === id,
    )
    if (part?.type === 'tool-call') return part
  }
  return undefined
}

function markWaiting(
  messages: Array<ViewMessage>,
  waiting: ReadonlySet<string>,
): Array<ViewMessage> {
  if (waiting.size === 0) return messages
  let changed = false
  const next = messages.map((message) => {
    if (message.role !== 'assistant') return message
    let touched = false
    const parts = message.parts.map((part) => {
      const isWaiting =
        part.type === 'tool-call' &&
        part.status === 'running' &&
        waiting.has(part.id)
      if (!isWaiting) return part
      touched = true
      return { ...part, status: 'needs-approval' as const }
    })
    if (!touched) return message
    changed = true
    return { ...message, parts }
  })
  return changed ? next : messages
}

/** `old` when `next` holds the same items, so selectors see no change. */
export function keep<T>(old: Array<T>, next: Array<T>): Array<T> {
  return old.length === next.length &&
    old.every((item, index) => item === next[index])
    ? old
    : next
}

/** The turn waits for the output of a client tool, not for a yes or no. */
const isClientTool = (interrupt: Interrupt) =>
  readUnopenedInterruptBinding(interrupt)?.kind === 'client-tool-execution'

/**
 * The sign-in a turn waits for, from `credentials.require(id, { wait: true })`.
 * The connector's `connect:<id>` command answers it, not a yes or no.
 */
function signInOf(interrupt: Interrupt): SignIn | undefined {
  if (interrupt.reason !== 'auth_required') return undefined
  const payload = recordOf(interrupt.metadata?.['tanstack:interruptPayload'])
  const request = recordOf(payload.request)
  if (typeof request.connector !== 'string') return undefined
  return {
    connector: request.connector,
    ...(typeof request.url === 'string' ? { url: request.url } : {}),
  }
}

/**
 * Take status, approvals, client tools, questions, and background agents
 * from a snapshot. Plugin state is taken only for the first snapshot. Later
 * changes come as `STATE_SNAPSHOT` events. Returns `state` when nothing
 * changes.
 */
export function applySnapshot(
  state: SessionViewState,
  snapshot: SessionSnapshot,
  factory: ItemFactory,
  options: { initial?: boolean } = {},
): SessionViewState {
  const approvals = keep(
    state.approvals,
    snapshot.pendingInterrupts
      .filter((interrupt) => !isClientTool(interrupt) && !signInOf(interrupt))
      .map(
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
    snapshot.pendingInterrupts
      .filter(isClientTool)
      .map(
        (interrupt) =>
          state.clientTools.find((item) => item.id === interrupt.id) ??
          factory.clientTool(
            interrupt,
            findToolCall(state.messages, interrupt.toolCallId),
          ),
      ),
  )
  // In the snapshot too, so a sign-in that a turn waits for shows after a reload.
  const newSignIns = snapshot.pendingInterrupts
    .flatMap((interrupt) => signInOf(interrupt) ?? [])
    .filter(
      (signIn) =>
        !state.signIns.some((item) => item.connector === signIn.connector),
    )
  const signIns =
    newSignIns.length > 0 ? [...state.signIns, ...newSignIns] : state.signIns
  const questions = keep(
    state.questions,
    snapshot.pendingQuestions.map(
      (question) =>
        state.questions.find((item) => item.id === question.questionId) ??
        factory.question(question),
    ),
  )
  const agents = keep(
    state.agents,
    snapshot.activeOperations
      .filter((operation) => operation.kind === 'agent')
      .map(
        (operation) =>
          state.agents.find((item) => item.id === operation.id) ?? {
            id: operation.id,
            name: operation.agent ?? 'agent',
          },
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
    approvals === state.approvals &&
    clientTools === state.clientTools &&
    signIns === state.signIns &&
    questions === state.questions &&
    agents === state.agents &&
    messages === state.messages &&
    plugins === state.plugins
  if (isSame) return state
  return {
    ...state,
    threadId: snapshot.threadId,
    status: snapshot.status,
    queuedTurns: snapshot.queuedTurns,
    approvals,
    clientTools,
    signIns,
    questions,
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
  }
}

/**
 * Messages for a saved transcript. Tool results fill in their tool calls.
 * The media a turn made (`metadata.harness.media`) goes at the end of its
 * assistant message.
 */
export function messagesFromTranscript(
  messages: ReadonlyArray<ModelMessage>,
): Array<ViewMessage> {
  const result: Array<ViewMessage> = []
  messages.forEach((message, index) => {
    const id = message.id ?? `history-${index}`
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
      result.push({ id, role: 'assistant', parts })
      return
    }
    // A tool message holds the result of an earlier tool call. The list is
    // new here, so it is safe to change in place.
    const call = findToolCall(result, message.toolCallId)
    if (!call) return
    call.status = message.error ? 'failed' : 'done'
    call.result = parseJson(textOf(message.content))
  })
  return result
}
