// Browser-safe: runtime imports only from @tanstack/ai, @tanstack/store,
// ../types, ../media-ref, and ./reduce. Everything else is a type.
import { EventType, readUnopenedInterruptBinding } from '@tanstack/ai'
import { createStore } from '@tanstack/store'
import { mediaPart } from '../media-ref'
import { HARNESS_EVENTS } from '../types'
import {
  applyDescription,
  applyEvent,
  applySnapshot,
  emptyState,
  keep,
  messagesFromTranscript,
  notAccepted,
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
import type { SessionDescription, SessionSnapshot } from '../session'
import type {
  Cursor,
  MediaRecord,
  Receipt,
  SessionEvent,
  UserInput,
} from '../types'
import type { ItemFactory } from './reduce'
import type {
  Approval,
  ClientToolCall,
  MediaPart,
  SessionViewState,
  SignIn,
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
  ViewMessage,
  ViewPart,
  ViewQuestion,
} from './types'

/** Get a new media URL this long before the old one expires. */
const URL_REFRESH_EARLY = 60_000

/** A local `HarnessSession` and a remote `HarnessClient` both fit this. */
export interface SessionViewSource {
  prompt: (message: UserInput) => unknown
  steer: (message: UserInput) => Promise<Receipt>
  resolve: (resume: Array<RunAgentResumeItem>) => Promise<Receipt>
  cancel: (operationId?: string) => Promise<Receipt>
  answer: (questionId: string, value: unknown) => Promise<Receipt>
  command: (name: string, input?: unknown) => unknown
  setConfig: (key: string, value: unknown) => Promise<Receipt>
  /** Send a message to an agent run. Without it, an agent's `send` rejects. */
  sendToAgent?: (
    operationId: string,
    message: UserInput,
    options?: { mode?: 'steer' | 'followUp' },
  ) => Promise<Receipt>
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
}

/** What `view.on(name, handler)` sends. */
export interface SessionViewEvents {
  approval: Approval
  clientTool: ClientToolCall
  question: ViewQuestion
  signIn: SignIn
  toolCall: { id: string; name: string }
  agent: { id: string; name: string; status: 'running' | 'done' | 'failed' }
  error: string
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
   * stored media files (from `upload` or `putMedia`) that go with the text.
   * A `/command` ignores them. Empty text with no attachments does nothing.
   */
  send: (
    text: string,
    attachments?: ReadonlyArray<MediaRecord>,
  ) => Promise<void>
  command: (name: string, input?: unknown) => Promise<void>
  setConfig: (key: string, value: unknown) => Promise<void>
  cancel: () => Promise<void>
  approve: (id: string) => void
  reject: (id: string) => void
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
    /^harness\.(operation|input|question|config)/.test(event.name)
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
  let resolving = false
  let disposed = false

  const get = () => internal.state
  const commit = (next: SessionViewState) => {
    if (disposed) return
    const shown = withMediaActions(next)
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
    const { approvals, clientTools } = get()
    const waiting = [...approvals, ...clientTools]
    const resume = waiting.flatMap((item) => decisions.get(item.id) ?? [])
    if (resume.length < waiting.length) return
    decisions.clear()
    resolving = true
    commit({ ...get(), approvals: [], clientTools: [] })
    void source
      .resolve(resume)
      .then(undefined, fail)
      .finally(() => {
        resolving = false
        refreshSnapshot()
      })
  }
  const decide = (id: string, approved: boolean) =>
    answer(get().approvals, {
      interruptId: id,
      status: 'resolved',
      payload: approved,
    })
  const decideAll = (approved: boolean) => {
    alive()
    const open = get().approvals
    for (const item of open) decide(item.id, approved)
  }

  const factory: ItemFactory = {
    approval: (interrupt, call) => ({
      id: interrupt.id,
      ...(interrupt.toolCallId ? { toolCallId: interrupt.toolCallId } : {}),
      tool: call?.name ?? interrupt.message ?? 'tool',
      args: call?.args,
      ...(interrupt.message ? { message: interrupt.message } : {}),
      approve: () => decide(interrupt.id, true),
      reject: () => decide(interrupt.id, false),
    }),
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
      answer: (value) => {
        alive()
        return source.answer(question.questionId, value)
      },
    }),
    agent: (operation) => ({
      ...operation,
      send: (message, mode) => {
        alive()
        if (!source.sendToAgent) {
          return Promise.reject(
            new Error('This view source cannot send messages to agents.'),
          )
        }
        return source.sendToAgent(
          operation.id,
          message,
          mode ? { mode } : undefined,
        )
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
      if (isTurnEnd) emit('turnEnd', { operationId })
      const isDescriptionChange =
        event.name === HARNESS_EVENTS.configChanged ||
        event.name === HARNESS_EVENTS.commandsChanged
      if (isDescriptionChange) refreshDescription()
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
        const before = get()
        const after = applyEvent(before, entry)
        commit(after)
        fire(entry, before, after)
        if (changesSnapshot(entry)) refreshSnapshot()
      }
    } catch (error) {
      fail(error)
    }
    if (!disposed) commit({ ...get(), connection: 'closed' })
  }

  const ready = (async () => {
    const [transcript, snapshot, description] = await Promise.all([
      source.transcript().catch((error: unknown) => {
        fail(error)
        return []
      }),
      Promise.resolve(source.snapshot()).catch((error: unknown) => {
        fail(error)
        return undefined
      }),
      Promise.resolve(source.describe()).catch((error: unknown) => {
        fail(error)
        return undefined
      }),
    ])
    if (disposed) return
    // History first, then anything a UI added before ready.
    commit({
      ...get(),
      messages: [...messagesFromTranscript(transcript), ...get().messages],
    })
    if (snapshot) takeSnapshot(snapshot, true)
    if (description) commit(applyDescription(get(), description))
    void read(snapshot?.cursor)
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
    command: async (name, input) => {
      alive()
      settle(source.command(name, input))
    },
    setConfig: async (key, value) => {
      alive()
      await source.setConfig(key, value).then(refused, fail)
    },
    cancel: async () => {
      alive()
      await source.cancel().then(undefined, fail)
    },
    approve: (id) => decide(id, true),
    reject: (id) => decide(id, false),
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
