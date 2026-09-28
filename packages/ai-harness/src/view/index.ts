// Browser-safe: runtime imports only from @tanstack/ai, @tanstack/store,
// ../types, and ./reduce. Everything else is a type.
import { EventType } from '@tanstack/ai'
import { createStore } from '@tanstack/store'
import { HARNESS_EVENTS } from '../types'
import {
  applyDescription,
  applyEvent,
  applySnapshot,
  emptyState,
  messagesFromTranscript,
  withNotice,
  withUserMessage,
} from './reduce'
import type { ModelMessage, RunAgentResumeItem } from '@tanstack/ai'
import type { ReadonlyStore } from '@tanstack/store'
import type { PluginEvent } from '../extensions'
import type { SessionDescription, SessionSnapshot } from '../session'
import type { Cursor, Receipt, SessionEvent } from '../types'
import type { ItemFactory } from './reduce'
import type { Approval, SessionViewState, SignIn, ViewQuestion } from './types'

export type {
  AgentPart,
  Approval,
  NoticeKind,
  SessionViewState,
  SignIn,
  ToolCallPart,
  ToolCallStatus,
  ViewCommand,
  ViewConfigEntry,
  ViewMessage,
  ViewPart,
  ViewQuestion,
} from './types'

/** A local `HarnessSession` and a remote `HarnessClient` both fit this. */
export interface SessionViewSource {
  prompt: (message: string) => unknown
  steer: (message: string) => Promise<Receipt>
  resolve: (resume: Array<RunAgentResumeItem>) => Promise<Receipt>
  cancel: (operationId?: string) => Promise<Receipt>
  answer: (questionId: string, value: unknown) => Promise<Receipt>
  command: (name: string, input?: unknown) => unknown
  setConfig: (key: string, value: unknown) => Promise<Receipt>
  events: (options: {
    from?: Cursor
    signal?: AbortSignal
    onConnection?: (state: 'open' | 'reconnecting') => void
  }) => AsyncIterable<SessionEvent>
  snapshot: () => SessionSnapshot | Promise<SessionSnapshot>
  transcript: () => Promise<Array<ModelMessage>>
  describe: () => SessionDescription | Promise<SessionDescription>
}

/** What `view.on(name, handler)` sends. */
export interface SessionViewEvents {
  approval: Approval
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
  /** A `/command`, a prompt, or a steer while a turn runs. Empty text does nothing. */
  send: (text: string) => Promise<void>
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
  /** Stop reading events. Later actions throw. */
  dispose: () => void
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
  const decisions = new Map<string, boolean>()
  const chatTurns = new Set<string>()
  const agentNames = new Map<string, string>()
  let resolving = false
  let disposed = false

  const get = () => internal.state
  const commit = (next: SessionViewState) => {
    if (!disposed && next !== internal.state) internal.setState(() => next)
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
  const alive = () => {
    if (disposed) throw new Error('The session view is disposed.')
  }
  /** A local operation reports failures as events. A remote call that throws did not arrive. */
  const settle = (result: unknown) => {
    if (isOperation(result)) {
      result.then(undefined, () => {})
      return
    }
    Promise.resolve(result).then(undefined, fail)
  }

  const decide = (id: string, approved: boolean) => {
    alive()
    const open = get().approvals
    const isDecided =
      resolving || decisions.has(id) || !open.some((item) => item.id === id)
    if (isDecided) return
    decisions.set(id, approved)
    if (!open.every((item) => decisions.has(item.id))) return
    const resume: Array<RunAgentResumeItem> = open.map((item) => ({
      interruptId: item.id,
      status: 'resolved',
      payload: decisions.get(item.id),
    }))
    decisions.clear()
    resolving = true
    commit({ ...get(), approvals: [] })
    void source
      .resolve(resume)
      .then(undefined, fail)
      .finally(() => {
        resolving = false
        refreshSnapshot()
      })
  }
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
    question: (question) => ({
      id: question.questionId,
      message: question.message,
      ...(question.schema ? { schema: question.schema } : {}),
      answer: (value) => {
        alive()
        return source.answer(question.questionId, value)
      },
    }),
  }

  const takeSnapshot = (snapshot: SessionSnapshot, initial = false) => {
    const before = get()
    const next = applySnapshot(before, snapshot, factory, { initial })
    commit(next)
    for (const approval of next.approvals)
      if (!before.approvals.includes(approval)) emit('approval', approval)
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
        emit(
          'error',
          `Not accepted: ${String(value.reason ?? 'unknown reason')}`,
        )
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
      if (event.name === HARNESS_EVENTS.configChanged) refreshDescription()
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
    send: async (text) => {
      alive()
      const line = text.trim()
      if (line === '') return
      if (line.startsWith('/')) {
        const [name = '', ...rest] = line.slice(1).split(' ')
        const input = rest.join(' ').trim()
        settle(source.command(name, input === '' ? undefined : input))
        return
      }
      commit(withUserMessage(get(), line))
      if (get().status === 'running') {
        await source.steer(line).then(undefined, fail)
        return
      }
      settle(source.prompt(line))
    },
    command: async (name, input) => {
      alive()
      settle(source.command(name, input))
    },
    setConfig: async (key, value) => {
      alive()
      await source.setConfig(key, value).then(undefined, fail)
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
    },
  }
  return view
}
