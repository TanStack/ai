// Browser-safe: runtime imports only from @tanstack/ai, @tanstack/store,
// ../types, ../media-ref, and ./reduce. Everything else is a type.
import {
  EventType,
  readUnopenedInterruptBinding,
  wireSubagentInfo,
} from '@tanstack/ai'
import { createStore } from '@tanstack/store'
import { mediaPart } from '../media-ref'
import { HARNESS_EVENTS } from '../types'
import {
  agentPartsFrom,
  applyDescription,
  applyEvent,
  applySnapshot,
  emptyAgentsIn,
  emptyState,
  keep,
  messagesFromTranscript,
  notAccepted,
  subagentOf,
  transcriptIds,
  withAgentParts,
  withNotice,
  withUserMessage,
} from './reduce'
import type {
  ContentPart,
  ModelMessage,
  RunAgentResumeItem,
} from '@tanstack/ai'
import type { ReadonlyStore } from '@tanstack/store'
import type { PluginEvent } from '../extensions'
import type { SessionDescription, SessionSnapshot } from '../session/index'
import type {
  Cursor,
  MediaRecord,
  Receipt,
  SessionEvent,
  ThreadSettingsChange,
  UserInput,
  WaitingInput,
} from '../types'
import type { ItemFactory } from './reduce'
import type {
  AgentPart,
  Approval,
  ApproveOptions,
  ClientToolCall,
  MediaPart,
  SessionViewState,
  SignIn,
  ViewInterrupt,
  ViewMessage,
  ViewPart,
  ViewQuestion,
} from './types'

export {
  MEDIA_URL_PREFIX,
  kindOf,
  mediaIdOf,
  mediaOfMessage,
  mediaPart,
} from '../media-ref'
export type { MediaKind, MediaRecord, WaitingInput } from '../types'
export type {
  AgentPart,
  Approval,
  ApproveOptions,
  ClientToolCall,
  MediaPart,
  NoticeKind,
  SessionViewState,
  SignIn,
  ToolCallPart,
  ToolCallStatus,
  ViewAgent,
  ViewCommand,
  ViewConfigEntry,
  ViewInterrupt,
  ViewMessage,
  ViewPart,
  ViewQuestion,
} from './types'

/** Lead events of a model call that come after its reasoning. */
const CALL_EVENTS: ReadonlySet<string> = new Set([
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_ARGS,
  EventType.TOOL_CALL_END,
  EventType.TOOL_CALL_RESULT,
])

/** How a saved child ended, from the card on its messages. */
function endOf(messages: ReadonlyArray<ModelMessage>) {
  const status = messages.map(wireSubagentInfo).find(Boolean)?.status
  if (status === 'finished') return 'done'
  return status === 'error' ? 'failed' : undefined
}

/** A retry that runs the model call again, with none of its output. */
function isRetry({ event }: SessionEvent) {
  return (
    event.type === EventType.CUSTOM &&
    event.name === HARNESS_EVENTS.turnRetry &&
    !(
      typeof event.value === 'object' &&
      event.value !== null &&
      'continued' in event.value &&
      event.value.continued === true
    )
  )
}

/** The end of a lead run or of an operation. */
function isEnd({ event }: SessionEvent) {
  if (event.type === EventType.CUSTOM)
    return event.name === HARNESS_EVENTS.operationFinished
  const isRunEnd =
    event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR
  return isRunEnd && !('subagentRunId' in event && event.subagentRunId)
}

/** Get a new media URL this long before the old one expires. */
const URL_REFRESH_EARLY = 60_000

/** A local `HarnessSession` and a remote `HarnessClient` both fit this. */
export interface SessionViewSource {
  prompt: (message: UserInput) => unknown
  steer: (message: UserInput) => Promise<Receipt>
  resolve: (resume: Array<RunAgentResumeItem>) => Promise<Receipt>
  cancel: (operationId?: string) => Promise<Receipt>
  // Both sources have these. Without one, its view action shows an error.
  followUp?: (message: UserInput) => Promise<Receipt>
  continue?: () => unknown
  cancelInput?: (inputId: string) => Promise<Receipt>
  setDelivery?: (change: {
    inputId: string
    delivery: WaitingInput['delivery']
  }) => Promise<Receipt>
  configure?: (settings: ThreadSettingsChange) => Promise<Receipt>
  reset?: (note?: string) => Promise<Receipt>
  revert?: (messageId: string) => Promise<Receipt>
  unrevert?: () => Promise<Receipt>
  answer: (answer: { questionId: string; value: unknown }) => Promise<Receipt>
  command: (name: string, input?: unknown) => unknown
  setConfig: (change: { key: string; value: unknown }) => Promise<Receipt>
  /** Send a message to an agent run. Without it, an agent's `send` rejects. */
  sendToAgent?: (options: {
    operationId: string
    message: UserInput
    mode?: 'steer' | 'followUp'
  }) => Promise<Receipt>
  events: (options: {
    from?: Cursor
    signal?: AbortSignal
    onConnection?: (state: 'open' | 'reconnecting') => void
  }) => AsyncIterable<SessionEvent>
  snapshot: () => SessionSnapshot | Promise<SessionSnapshot>
  transcript: () => Promise<Array<ModelMessage>>
  describe: () => SessionDescription | Promise<SessionDescription>
  /** A URL for a media file. Without it, media parts have no `url`. */
  mediaUrl?: (id: string) => Promise<{ url?: string; expiresAt?: number }>
  /** The bytes of a media file. Without it, `load()` rejects. */
  loadMedia?: (id: string) => Promise<Uint8Array>
  /** Store a file: `upload` on a client, `putMedia` on a session. */
  upload?: (body: MediaBody, info: MediaInfo) => Promise<MediaRecord>
  putMedia?: (body: MediaBody, info: MediaInfo) => Promise<MediaRecord>
  /** The saved messages of a child agent run. Without it, a reload shows no child parts. */
  agentTranscript?: (subagentRunId: string) => Promise<Array<ModelMessage>>
}

/** The bytes of a file to store. */
type MediaBody = ArrayBuffer | Uint8Array
type MediaInfo = { name: string; mimeType: string }

/**
 * What `view.on(name, handler)` sends.
 *
 * @experimental The event names and values can change in a minor release.
 */
export interface SessionViewEvents {
  approval: Approval
  clientTool: ClientToolCall
  interrupt: ViewInterrupt
  question: ViewQuestion
  signIn: SignIn
  toolCall: { id: string; name: string }
  agent: { id: string; name: string; status: 'running' | 'done' | 'failed' }
  error: string
  /** A chat turn ended. A turn that stops for an interrupt does not end. */
  turnEnd: { operationId: string }
}

/** A name from `SessionViewEvents`, or a plugin event from `createPluginEvent`. */
type ViewEventKey = keyof SessionViewEvents | PluginEvent<unknown>

/** The value that `view.on(key, handler)` gives to `handler`. */
type ViewEventValue<K> = K extends keyof SessionViewEvents
  ? SessionViewEvents[K]
  : K extends PluginEvent<infer T>
    ? T
    : never

export interface SessionView {
  /** The live state. Read it with `get()`, `subscribe()`, or `useSelector()`. */
  store: ReadonlyStore<SessionViewState>
  /** Resolves when history, the first snapshot, and the description are in. */
  ready: Promise<void>
  /**
   * A `/command`, a prompt, or a steer while a turn runs. `attachments` are
   * stored media files (from `upload`) that go with the text.
   * A `/command` ignores them. Empty text with no attachments does nothing.
   */
  send: (
    text: string,
    attachments?: ReadonlyArray<MediaRecord>,
  ) => Promise<void>
  /** A message that runs as its own turn after the current work. */
  followUp: (
    text: string,
    attachments?: ReadonlyArray<MediaRecord>,
  ) => Promise<void>
  /** Start a turn from the saved messages, with no new message. */
  continue: () => Promise<void>
  /** Store a file. Send its record with `send(text, [record])`. */
  upload: (body: MediaBody, info: MediaInfo) => Promise<MediaRecord>
  command: (name: string, input?: unknown) => Promise<void>
  setConfig: (change: { key: string; value: unknown }) => Promise<void>
  /** Change the stored settings of the thread, for example the model. */
  configure: (settings: ThreadSettingsChange) => Promise<void>
  /** Stop the running turn, or the operation `operationId`. */
  cancel: (operationId?: string) => Promise<void>
  /** Drop an input from `waitingInputs` before it runs. */
  cancelInput: (inputId: string) => Promise<void>
  /** Move a waiting input: `'steer'` joins the running turn, `'queue'` waits for its own turn. */
  setDelivery: (change: {
    inputId: string
    delivery: WaitingInput['delivery']
  }) => Promise<void>
  /** Start a fresh model context. The model sees `note` first. */
  reset: (note?: string) => Promise<void>
  /** Go back to the message `messageId`. `unrevert` undoes it. */
  revert: (messageId: string) => Promise<void>
  unrevert: () => Promise<void>
  approve: (id: string, options?: ApproveOptions) => void
  reject: (id: string, payload?: unknown) => void
  approveAll: () => void
  rejectAll: () => void
  /** Add a line of your own to the messages. */
  notice: (text: string) => void
  /**
   * Listen for a view event (`'approval'`, `'turnEnd'`, ...) or a plugin event.
   * Returns a function that stops listening.
   */
  on: <K extends ViewEventKey>(
    key: K,
    handler: (value: ViewEventValue<K>) => void,
  ) => () => void
  /** Stop reading events and getting new media URLs. Later actions throw. */
  dispose: () => void
}

/** What a line and its attachments send: plain text when there are none. */
function userInput(line: string, attachments: ReadonlyArray<MediaRecord>) {
  if (attachments.length === 0) return line
  const files = attachments.map(mediaPart)
  const input: Array<ContentPart> =
    line === '' ? files : [{ type: 'text', content: line }, ...files]
  return input
}

/** Events after which the snapshot can differ. */
function changesSnapshot(entry: SessionEvent) {
  const { event } = entry
  if (
    event.type === EventType.RUN_STARTED ||
    event.type === EventType.RUN_FINISHED ||
    event.type === EventType.RUN_ERROR
  ) {
    return !('subagentRunId' in event && event.subagentRunId)
  }
  return (
    event.type === EventType.CUSTOM &&
    /^harness\.(operation|input|question|config|usage)/.test(event.name)
  )
}

/**
 * A receipt that `applyInput` refused before the session saw the input. The
 * session reports its own refusals with a `harness.input.rejected` event, so
 * the view shows only this one from the receipt.
 */
function isNotExposed(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reason' in value &&
    value.reason === 'not_exposed'
  )
}

function isOperation(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof value.status === 'function' &&
    'then' in value
  )
}

/** Run `task` now, or once more after the running one ends. */
function coalesce(task: () => Promise<void>) {
  let running = false
  let again = false
  const run = async () => {
    running = true
    do {
      again = false
      await task()
    } while (again)
    running = false
  }
  return () => {
    if (running) again = true
    else void run()
  }
}

/**
 * A live view of a harness session for any UI. It reads the events, keeps one
 * state in a TanStack Store, and gives actions and typed events.
 *
 * @param source A local `HarnessSession` (from `host.open`) or a remote
 * `HarnessClient` (from `createHarnessClient`).
 *
 * @example
 * ```ts
 * const view = createSessionView(session)
 * view.store.subscribe((state) => draw(state))
 * view.on('approval', (approval) => approval.approve())
 * await view.send('fix the failing test')
 * ```
 *
 * @experimental The view API and its state can change in a minor release.
 */
export function createSessionView(source: SessionViewSource) {
  const internal = createStore(emptyState())
  const store = createStore(() => internal.state)
  const reader = new AbortController()
  const handlers = new Map<string, Set<(value: unknown) => void>>()
  /** The answer to each open approval and client tool, by interrupt id. */
  const decisions = new Map<string, RunAgentResumeItem>()
  const chatTurns = new Set<string>()
  const agentNames = new Map<string, string>()
  const mediaParts = new Map<string, MediaPart>()
  const urlRefreshes = new Map<string, ReturnType<typeof setTimeout>>()
  /** The media ids the last commit shows. */
  let shownMedia = new Set<string>()
  /** The agent parts of a reload that loaded, or load now. */
  const loadedAgents = new Set<string>()
  /** The ids the first transcript has. See `replayed`. */
  let saved = new Set<string>()
  /** The replay of the operations that ran at start ends at this cursor. */
  let replayEnd = -1
  let replayOps = new Set<string>()
  /** Replayed lead reasoning that waits for its model call. See `replayed`. */
  let held: Array<SessionEvent> = []
  let resolving = false
  let disposed = false

  const get = () => internal.state
  const commit = (next: SessionViewState) => {
    if (disposed) return
    shownMedia = new Set()
    const shown = withMediaActions(next)
    // A media file that no message shows now (after a revert) needs no URL.
    for (const id of mediaParts.keys()) {
      if (shownMedia.has(id)) continue
      clearTimeout(urlRefreshes.get(id))
      urlRefreshes.delete(id)
      mediaParts.delete(id)
    }
    if (shown !== internal.state) internal.setState(() => shown)
  }
  const emit = (key: string, value: unknown) => {
    const listeners = handlers.get(key) ?? []
    for (const listener of listeners) {
      try {
        listener(value)
      } catch {
        // One broken handler must not stop the others.
      }
    }
  }
  const fail = (error: unknown) => {
    if (disposed) return
    const message = error instanceof Error ? error.message : String(error)
    commit(withNotice(get(), 'error', message))
    emit('error', message)
  }
  /** Show a refused receipt that no event reports. See `isNotExposed`. */
  const refused = (result: unknown) => {
    if (disposed || !isNotExposed(result)) return
    const text = notAccepted('not_exposed')
    commit(withNotice(get(), 'rejected', text))
    emit('error', text)
  }
  const alive = () => {
    if (disposed) throw new Error('The session view is disposed.')
  }
  /** Run a source call, and show a refused receipt or an error. */
  const act = async (call: () => Promise<Receipt>) => {
    alive()
    await call().then(refused, fail)
  }
  const missing = (what: string) =>
    Promise.reject(new Error(`This view source cannot ${what}.`))
  /** A local operation reports failures as events. A remote call that throws did not arrive. */
  const settle = (result: unknown) => {
    if (isOperation(result)) {
      result.then(undefined, () => {})
      return
    }
    Promise.resolve(result).then(refused, fail)
  }

  const fetchUrl = async (id: string) => {
    if (!source.mediaUrl) return
    try {
      const { url, expiresAt } = await source.mediaUrl(id)
      const part = mediaParts.get(id)
      if (disposed || !part) return
      if (url !== undefined) mediaParts.set(id, { ...part, url })
      commit(get())
      if (expiresAt === undefined) return
      const left = expiresAt - Date.now()
      // ponytail: at least half the time left, and at least a second, so a
      // URL with a short life does not refresh in a loop.
      const delay = Math.max(left - URL_REFRESH_EARLY, left / 2, 1000)
      urlRefreshes.set(
        id,
        setTimeout(() => void fetchUrl(id), delay),
      )
    } catch (error) {
      fail(error)
    }
  }
  /** The view's own part for a media id: it loads from the source and gets a url once. */
  const mediaActions = (part: MediaPart) => {
    shownMedia.add(part.id)
    const known = mediaParts.get(part.id)
    if (known) return known
    const { id } = part
    const shown: MediaPart = {
      ...part,
      load: () =>
        source.loadMedia
          ? source.loadMedia(id)
          : Promise.reject(new Error('This session source cannot load media.')),
    }
    mediaParts.set(id, shown)
    void fetchUrl(id)
    return shown
  }
  const partsWithActions = (parts: Array<ViewPart>): Array<ViewPart> =>
    keep(
      parts,
      parts.map((part) => {
        if (part.type === 'media') return mediaActions(part)
        if (part.type !== 'agent') return part
        const inner = partsWithActions(part.parts)
        return inner === part.parts ? part : { ...part, parts: inner }
      }),
    )
  const messageWithActions = (message: ViewMessage) => {
    if (message.role === 'assistant') {
      const parts = partsWithActions(message.parts)
      return parts === message.parts ? message : { ...message, parts }
    }
    if (message.role !== 'user' || !message.media) return message
    const media = keep(message.media, message.media.map(mediaActions))
    return media === message.media ? message : { ...message, media }
  }
  // ponytail: this walks every message on each commit. Track new media ids
  // instead if a long session gets slow.
  const withMediaActions = (state: SessionViewState) => {
    const messages = keep(
      state.messages,
      state.messages.map(messageWithActions),
    )
    return messages === state.messages ? state : { ...state, messages }
  }

  /**
   * Keep the answer to an item of `open`. One resume must answer every open
   * interrupt, so it goes when each approval and client tool has an answer.
   */
  const answer = (
    open: ReadonlyArray<{ id: string }>,
    entry: RunAgentResumeItem,
  ) => {
    alive()
    const id = entry.interruptId
    const isDecided =
      resolving || decisions.has(id) || !open.some((item) => item.id === id)
    if (isDecided) return
    decisions.set(id, entry)
    const { approvals, clientTools, interrupts } = get()
    const waiting = [...approvals, ...clientTools, ...interrupts]
    const resume = waiting.flatMap((item) => decisions.get(item.id) ?? [])
    if (resume.length < waiting.length) return
    decisions.clear()
    resolving = true
    commit({ ...get(), approvals: [], clientTools: [], interrupts: [] })
    void source
      .resolve(resume)
      .then(undefined, fail)
      .finally(() => {
        resolving = false
        refreshSnapshot()
      })
  }
  /** `payload` is a `ToolApprovalResolution`: a boolean or an object. */
  const decide = (id: string, payload: unknown) =>
    answer(get().approvals, { interruptId: id, status: 'resolved', payload })
  const approvedWith = (options?: ApproveOptions) =>
    options ? { ...options, approved: true } : true
  const rejectedWith = (payload?: unknown) =>
    payload === undefined ? false : { approved: false, payload }
  const decideAll = (approved: boolean) => {
    alive()
    const open = get().approvals
    for (const item of open) decide(item.id, approved)
  }

  const factory: ItemFactory = {
    approval: (interrupt, call) => {
      // A call the view has not seen, for example in a reloaded child agent:
      // the binding has its name and arguments.
      const binding = readUnopenedInterruptBinding(interrupt)
      const bound = binding?.kind === 'tool-approval' ? binding : undefined
      return {
        id: interrupt.id,
        ...(interrupt.toolCallId ? { toolCallId: interrupt.toolCallId } : {}),
        tool: call?.name ?? bound?.toolName ?? interrupt.message ?? 'tool',
        args: call?.args ?? bound?.originalArgs,
        ...(interrupt.message ? { message: interrupt.message } : {}),
        approve: (options) => decide(interrupt.id, approvedWith(options)),
        reject: (payload) => decide(interrupt.id, rejectedWith(payload)),
      }
    },
    interrupt: (interrupt) => {
      const open = () => get().interrupts
      const payload = interrupt.metadata?.['tanstack:interruptPayload']
      const { message, toolCallId, subagentRunId, responseSchema } = interrupt
      const item: ViewInterrupt = {
        id: interrupt.id,
        reason: interrupt.reason,
        ...(message ? { message } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(subagentRunId ? { subagentRunId } : {}),
        ...(responseSchema ? { responseSchema } : {}),
        ...(payload !== undefined ? { payload } : {}),
        resolve: (value) =>
          answer(open(), {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: value,
          }),
        cancel: () =>
          answer(open(), { interruptId: interrupt.id, status: 'cancelled' }),
      }
      return item
    },
    clientTool: (interrupt, call) => {
      const binding = readUnopenedInterruptBinding(interrupt)
      const open = () => get().clientTools
      return {
        id: interrupt.id,
        ...(interrupt.toolCallId ? { toolCallId: interrupt.toolCallId } : {}),
        tool:
          call?.name ??
          (binding?.kind === 'client-tool-execution'
            ? binding.toolName
            : 'tool'),
        args: call?.args ?? interrupt.metadata?.input,
        resolve: (output) =>
          answer(open(), {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: output,
          }),
        // The output-error form the chat engine reads for a failed client tool.
        fail: (message) =>
          answer(open(), {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: { error: message },
            metadata: { tanstack: { state: 'output-error' } },
          }),
      }
    },
    question: (question) => ({
      id: question.questionId,
      message: question.message,
      ...(question.schema ? { schema: question.schema } : {}),
      ...(question.secret ? { secret: true } : {}),
      ...(question.url ? { url: question.url } : {}),
      answer: (value) => {
        alive()
        return source.answer({ questionId: question.questionId, value })
      },
    }),
    agent: (operation) => ({
      ...operation,
      send: (message, options) => {
        alive()
        if (!source.sendToAgent) {
          return Promise.reject(
            new Error('This view source cannot send messages to agents.'),
          )
        }
        return source.sendToAgent({
          operationId: operation.id,
          message,
          ...(options?.mode ? { mode: options.mode } : {}),
        })
      },
      cancel: () => {
        alive()
        return source.cancel(operation.id)
      },
    }),
  }

  const takeSnapshot = (snapshot: SessionSnapshot, initial = false) => {
    const before = get()
    const next = applySnapshot(before, snapshot, factory, { initial })
    commit(next)
    for (const approval of next.approvals)
      if (!before.approvals.includes(approval)) emit('approval', approval)
    for (const call of next.clientTools)
      if (!before.clientTools.includes(call)) emit('clientTool', call)
    for (const item of next.interrupts)
      if (!before.interrupts.includes(item)) emit('interrupt', item)
    for (const signIn of next.signIns)
      if (!before.signIns.includes(signIn)) emit('signIn', signIn)
    for (const question of next.questions)
      if (!before.questions.includes(question)) emit('question', question)
  }

  const refreshSnapshot = coalesce(async () => {
    try {
      const snapshot = await source.snapshot()
      if (!disposed) takeSnapshot(snapshot)
    } catch (error) {
      fail(error)
    }
  })
  const refreshDescription = coalesce(async () => {
    try {
      const description = await source.describe()
      if (!disposed) commit(applyDescription(get(), description))
    } catch (error) {
      fail(error)
    }
  })

  /**
   * Fill the agent parts `ids` that the saved messages made, from the saved
   * messages of each child, then the nested children those hold.
   */
  const loadAgents = async (agents: Array<AgentPart>): Promise<void> => {
    if (!source.agentTranscript) return
    // ponytail: every child loads at start. Load on demand if long sessions
    // get slow.
    await Promise.all(
      agents.map(async ({ id }) => {
        // A continued child has one id for each of its calls.
        if (loadedAgents.has(id)) return
        loadedAgents.add(id)
        try {
          const messages = (await source.agentTranscript?.(id)) ?? []
          const parts = agentPartsFrom(messages)
          if (disposed) return
          // A child that failed before its first message has only its card.
          commit(withAgentParts(get(), id, parts, endOf(messages)))
          await loadAgents(emptyAgentsIn([{ id, role: 'assistant', parts }]))
        } catch (error) {
          fail(error)
        }
      }),
    )
  }

  // A revert changes which saved messages show. The session is idle then.
  const refreshTranscript = coalesce(async () => {
    try {
      const transcript = await source.transcript()
      if (disposed) return
      const messages = messagesFromTranscript(transcript)
      commit({ ...get(), messages })
      loadedAgents.clear()
      await loadAgents(emptyAgentsIn(messages))
    } catch (error) {
      fail(error)
    }
  })

  const fire = (
    entry: SessionEvent,
    before: SessionViewState,
    after: SessionViewState,
  ) => {
    const { event } = entry
    if (event.type === EventType.TOOL_CALL_START)
      emit('toolCall', { id: event.toolCallId, name: event.toolCallName })
    if (event.type === EventType.SUBAGENT_STARTED) {
      const name = event.name ?? 'agent'
      agentNames.set(event.subagentRunId, name)
      emit('agent', { id: event.subagentRunId, name, status: 'running' })
    }
    if (
      event.type === EventType.SUBAGENT_FINISHED ||
      event.type === EventType.SUBAGENT_ERROR
    ) {
      emit('agent', {
        id: event.subagentRunId,
        name: agentNames.get(event.subagentRunId) ?? 'agent',
        status: event.type === EventType.SUBAGENT_FINISHED ? 'done' : 'failed',
      })
    }
    const isLeadError =
      event.type === EventType.RUN_ERROR &&
      !('subagentRunId' in event && event.subagentRunId)
    if (isLeadError) emit('error', `Error: ${event.message}`)
    if (event.type === EventType.CUSTOM) {
      const value: Record<string, unknown> =
        typeof event.value === 'object' && event.value !== null
          ? event.value
          : {}
      const operationId = String(value.operationId)
      if (event.name === HARNESS_EVENTS.inputRejected)
        emit('error', notAccepted(value.reason))
      if (
        event.name === HARNESS_EVENTS.pluginEvent &&
        typeof value.name === 'string'
      )
        emit(`plugin:${value.name}`, value.value)
      if (
        event.name === HARNESS_EVENTS.operationStarted &&
        value.kind === 'chat'
      )
        chatTurns.add(operationId)
      const isTurnEnd =
        event.name === HARNESS_EVENTS.operationFinished &&
        chatTurns.delete(operationId)
      // The resolve of an interrupt runs as a new chat turn.
      if (isTurnEnd && value.status !== 'interrupted')
        emit('turnEnd', { operationId })
      const isDescriptionChange =
        event.name === HARNESS_EVENTS.configChanged ||
        event.name === HARNESS_EVENTS.settingsChanged ||
        event.name === HARNESS_EVENTS.commandsChanged ||
        event.name === HARNESS_EVENTS.reloaded
      if (isDescriptionChange) refreshDescription()
      if (event.name === HARNESS_EVENTS.revert) refreshTranscript()
    }
    for (const signIn of after.signIns)
      if (!before.signIns.includes(signIn)) emit('signIn', signIn)
  }

  const read = async (from: Cursor | undefined) => {
    try {
      const entries = source.events({
        ...(from ? { from } : {}),
        signal: reader.signal,
        onConnection: (connection) => commit({ ...get(), connection }),
      })
      for await (const entry of entries) {
        if (disposed) return
        for (const ready of replayed(entry)) apply(ready)
      }
    } catch (error) {
      fail(error)
    }
    if (!disposed) commit({ ...get(), connection: 'closed' })
  }

  const apply = (entry: SessionEvent) => {
    if (disposed) return
    const before = get()
    const after = applyEvent(before, entry)
    commit(after)
    fire(entry, before, after)
    if (changesSnapshot(entry)) refreshSnapshot()
  }

  /**
   * An event of the saved transcript: `'skip'` for a part the transcript
   * shows, `'boundary'` for a tool result of a saved call (it still applies).
   * Only replayed events can be saved: a background child or a continued
   * child keeps its id, and its later events are new.
   */
  const isSaved = ({ event }: SessionEvent) => {
    const child = subagentOf(event)
    // A child of a saved child is saved too.
    const isSavedChild =
      event.type === EventType.SUBAGENT_STARTED &&
      saved.has(event.parentSubagentRunId ?? '')
    if (isSavedChild) saved.add(event.subagentRunId)
    if (child !== undefined) return saved.has(child) ? 'skip' : undefined
    const id =
      event.type === EventType.TEXT_MESSAGE_CONTENT
        ? event.messageId
        : event.type === EventType.TOOL_CALL_START ||
            event.type === EventType.TOOL_CALL_ARGS ||
            event.type === EventType.TOOL_CALL_END ||
            event.type === EventType.TOOL_CALL_RESULT
          ? event.toolCallId
          : undefined
    if (id === undefined || !saved.has(id)) return undefined
    return event.type === EventType.TOOL_CALL_RESULT ? 'boundary' : 'skip'
  }

  /** The held reasoning of `operationId`, out of `held`. */
  const takeHeld = (operationId: string) => {
    const out = held.filter((item) => item.operationId === operationId)
    held = held.filter((item) => item.operationId !== operationId)
    return out
  }

  /**
   * The events to apply now. An operation that ran when the view opened
   * replays from its start. Events of other operations in that range are in
   * the transcript already, and so are the saved model calls of the running
   * turn: their text and tool calls are dropped by id. A model call can also
   * be saved between the snapshot and the transcript reads, so lead events
   * after the replay are checked too. Reasoning has no saved id, so replayed
   * lead reasoning waits for the next text or tool call of its operation, and
   * goes with it when that one is saved. A retry drops it. The end of its
   * operation shows it.
   */
  const replayed = (entry: SessionEvent): Array<SessionEvent> => {
    const inReplay = Number(entry.cursor) <= replayEnd
    const { event } = entry
    const operation = entry.operationId
    const isLead = subagentOf(event) === undefined
    if (inReplay && !replayOps.has(operation)) return []
    if (isRetry(entry)) {
      takeHeld(operation)
      return [entry]
    }
    const isWaiting = held.some((item) => item.operationId === operation)
    if (
      isLead &&
      event.type.startsWith('REASONING') &&
      (inReplay || isWaiting)
    ) {
      held.push(entry)
      return []
    }
    const found = inReplay || isLead ? isSaved(entry) : undefined
    const isCall = isLead && CALL_EVENTS.has(event.type)
    const waiting = isCall || isEnd(entry) ? takeHeld(operation) : []
    if (found) return found === 'skip' ? [] : [entry]
    return [...waiting, entry]
  }

  const ready = (async () => {
    const describing = Promise.resolve(source.describe()).catch(
      (error: unknown) => {
        fail(error)
        return undefined
      },
    )
    // The snapshot before the transcript: a turn that ends between the two
    // reads is in the transcript, and `replayed` drops its events.
    const snapshot = await Promise.resolve(source.snapshot()).catch(
      (error: unknown) => {
        fail(error)
        return undefined
      },
    )
    const transcript = await source.transcript().catch((error: unknown) => {
      fail(error)
      return []
    })
    const description = await describing
    if (disposed) return
    // History first, then anything a UI added before ready.
    commit({
      ...get(),
      messages: [...messagesFromTranscript(transcript), ...get().messages],
    })
    if (snapshot) takeSnapshot(snapshot, true)
    if (description) commit(applyDescription(get(), description))
    saved = transcriptIds(transcript)
    // ponytail: a cursor is a sequence number in both feeds (`feed.ts`,
    // `log.ts`), so `Number` orders them.
    const starts = (snapshot?.activeOperations ?? []).flatMap((operation) =>
      operation.startedCursor === undefined
        ? []
        : [Number(operation.startedCursor)],
    )
    const head = Number(snapshot?.cursor ?? 0)
    const from = Math.min(head, ...starts)
    if (from < head) {
      replayEnd = head
      replayOps = new Set(snapshot?.activeOperations.map((item) => item.id))
    }
    // ponytail: a background child that runs now can save a model call
    // before its saved messages load, and that call then shows twice. Drop
    // live parts by id if that shows up.
    void loadAgents(emptyAgentsIn(get().messages))
    void read(snapshot ? String(from) : undefined)
  })()

  const on: SessionView['on'] = (key, handler) => {
    const name = typeof key === 'string' ? key : `plugin:${key.name}`
    // A plugin event value is JSON from the session. Its type comes from the
    // `PluginEvent` the caller passes, as with `ctx.on` in a plugin.
    const listener = (value: unknown) => handler(value as never)
    let set = handlers.get(name)
    if (!set) {
      set = new Set()
      handlers.set(name, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  const view: SessionView = {
    store,
    ready,
    send: async (text, attachments = []) => {
      alive()
      const line = text.trim()
      if (line === '' && attachments.length === 0) return
      if (line.startsWith('/')) {
        const [name = '', ...rest] = line.slice(1).split(' ')
        const input = rest.join(' ').trim()
        settle(source.command(name, input === '' ? undefined : input))
        return
      }
      commit(withUserMessage(get(), line, attachments))
      const message = userInput(line, attachments)
      if (get().status === 'running') {
        await source.steer(message).then(refused, fail)
        return
      }
      settle(source.prompt(message))
    },
    followUp: async (text, attachments = []) => {
      alive()
      const line = text.trim()
      if (line === '' && attachments.length === 0) return
      commit(withUserMessage(get(), line, attachments))
      const message = userInput(line, attachments)
      await act(() =>
        source.followUp ? source.followUp(message) : missing('follow up'),
      )
    },
    continue: async () => {
      alive()
      settle(source.continue ? source.continue() : missing('continue'))
    },
    upload: (body, info) => {
      alive()
      if (source.upload) return source.upload(body, info)
      if (source.putMedia) return source.putMedia(body, info)
      return Promise.reject(new Error('This view source cannot store media.'))
    },
    command: async (name, input) => {
      alive()
      settle(source.command(name, input))
    },
    setConfig: (change) => act(() => source.setConfig(change)),
    configure: (settings) =>
      act(() =>
        source.configure ? source.configure(settings) : missing('configure'),
      ),
    cancel: (operationId) => act(() => source.cancel(operationId)),
    cancelInput: (inputId) =>
      act(() =>
        source.cancelInput
          ? source.cancelInput(inputId)
          : missing('cancel inputs'),
      ),
    setDelivery: (change) =>
      act(() =>
        source.setDelivery
          ? source.setDelivery(change)
          : missing('move inputs'),
      ),
    reset: (note) =>
      act(() => (source.reset ? source.reset(note) : missing('reset'))),
    revert: (messageId) =>
      act(() => (source.revert ? source.revert(messageId) : missing('revert'))),
    unrevert: () =>
      act(() => (source.unrevert ? source.unrevert() : missing('unrevert'))),
    approve: (id, options) => decide(id, approvedWith(options)),
    reject: (id, payload) => decide(id, rejectedWith(payload)),
    approveAll: () => decideAll(true),
    rejectAll: () => decideAll(false),
    notice: (text) => {
      alive()
      commit(withNotice(get(), 'ui', text))
    },
    on,
    dispose: () => {
      if (disposed) return
      commit({ ...get(), connection: 'closed' })
      disposed = true
      reader.abort()
      for (const timer of urlRefreshes.values()) clearTimeout(timer)
      urlRefreshes.clear()
    },
  }
  return view
}
