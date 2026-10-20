// Browser-safe: runtime imports only from @tanstack/ai, @tanstack/store,
// ../types, ../media-ref, and ./reduce (it also reads ../usage). Everything
// else is a type.
import {
  EventType,
  INTERRUPT_PAYLOAD_METADATA_KEY,
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
  CancelOptions,
  CommandOptions,
  ConfigureOptions,
  Cursor,
  MediaRecord,
  MediaUpload,
  Receipt,
  ResetOptions,
  ResolveOptions,
  SessionEvent,
  UserInput,
  WaitingInput,
  Operation,
} from '../types'
import type { ItemFactory } from './reduce'
import type {
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
import type { PendingWait } from '../waits'

export {
  MEDIA_URL_PREFIX,
  kindOf,
  mediaIdOf,
  mediaOfMessage,
  mediaPart,
} from '../media-ref'
export type { MediaKind, MediaRecord, WaitingInput } from '../types'
export {
  isApproval,
  waitKind,
  waitFromInterrupt,
  waitFromQuestion,
} from '../waits'
export type { PendingWait, Wait, WaitKind, WaitOutcome } from '../waits'
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

/** The options a view gives `source.send` for a turn. */
export type ViewSendOptions = { to?: undefined } & (
  | {
      mode?: 'prompt'
      /** `'operator'`: an operator reply. See `SendOptions.as`. */
      as?: 'operator'
    }
  | { mode: 'steer' | 'followUp'; as?: never }
)

/** The options of `view.send`. */
export interface ViewTextOptions {
  /** Stored media files (from `putMedia`) that go with the text. */
  attachments?: ReadonlyArray<MediaRecord>
  /**
   * `'operator'`: the reply of an operator while a handoff to a person is
   * open. No model runs, and it is not a `/command`. The user of the view
   * needs the `operator` access action.
   */
  as?: 'operator'
}

/** True when `view.send` got its attachments as a list. */
const isAttachmentList = (
  options: ViewTextOptions | ReadonlyArray<MediaRecord>,
): options is ReadonlyArray<MediaRecord> => Array.isArray(options)

/** The options a view gives `source.send` for a message to an agent run. */
export interface ViewAgentSendOptions {
  to: string
  mode?: 'steer' | 'followUp'
}

/** A local `HarnessSession` and a remote `HarnessClient` both fit this. */
export interface SessionViewSource {
  /**
   * `session.send` or `client.send`. A local session returns an operation,
   * a client the receipt. With `to`, it goes to an agent run.
   */
  send: {
    (message: UserInput, options: ViewAgentSendOptions): unknown
    (message: UserInput, options?: ViewSendOptions): unknown
  }
  resolve: (options: ResolveOptions) => Promise<Receipt>
  cancel: (options?: CancelOptions) => Promise<Receipt>
  // Both sources have these. Without one, its view action shows an error.
  continueWithoutMessage?: () => unknown
  cancelInput?: (options: { inputId: string }) => Promise<Receipt>
  changeInputDelivery?: (change: {
    inputId: string
    delivery: WaitingInput['delivery']
  }) => Promise<Receipt>
  updateThreadSettings?: (options: ConfigureOptions) => Promise<Receipt>
  reset?: (options?: ResetOptions) => Promise<Receipt>
  revert?: (options: { messageId: string }) => Promise<Receipt>
  unrevert?: () => Promise<Receipt>
  answer: (answer: { questionId: string; value: unknown }) => Promise<Receipt>
  runCommand: (options: CommandOptions) => unknown
  setPluginSetting: (change: {
    key: string
    value: unknown
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
  mediaUrl?: (options: {
    id: string
  }) => Promise<{ url?: string; expiresAt?: number }>
  /** The bytes of a media file. Without it, `load()` rejects. */
  loadMedia?: (options: { id: string }) => Promise<Uint8Array>
  /** Store a file. Without it, `view.putMedia` rejects. */
  putMedia?: (file: MediaUpload<MediaBody>) => Promise<MediaRecord>
  /** The saved messages of a child agent run. Without it, a reload shows no child parts. */
  agentTranscript?: (options: {
    subagentRunId: string
  }) => Promise<Array<ModelMessage>>
}

/** The bytes of a file to store. */
type MediaBody = ArrayBuffer | Uint8Array

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
   * stored media files (from `putMedia`) that go with the text. Pass them as
   * a list, or as `{ attachments }`. A `/command` ignores them. Empty text
   * with no attachments does nothing. `{ as: 'operator' }` sends the reply
   * of an operator (see {@link ViewTextOptions}).
   *
   * @example
   * ```ts
   * await view.send('I refunded order 42.', { as: 'operator' })
   * ```
   */
  send: (
    text: string,
    options?: ViewTextOptions | ReadonlyArray<MediaRecord>,
  ) => Promise<void>
  /** A message that runs as its own turn after the current work. */
  followUp: (
    text: string,
    attachments?: ReadonlyArray<MediaRecord>,
  ) => Promise<void>
  /** Start a turn from the saved messages, with no new message. */
  continueWithoutMessage: () => Promise<void>
  /**
   * Store a file. Send its record with `send(text, [record])`.
   *
   * @example
   * ```ts
   * const record = await view.putMedia({ body: bytes, mimeType: 'image/png', name: 'cat.png' })
   * ```
   */
  putMedia: (file: MediaUpload<MediaBody>) => Promise<MediaRecord>
  /**
   * Run the plugin command `name` with its `input`.
   *
   * @example
   * ```ts
   * await view.runCommand({ name: 'mode', input: 'plan' })
   * ```
   */
  runCommand: (options: CommandOptions) => Promise<void>
  setPluginSetting: (change: { key: string; value: unknown }) => Promise<void>
  /**
   * Change the stored settings of the thread, for example the model.
   *
   * @example
   * ```ts
   * await view.updateThreadSettings({ settings: { model: 'strong' } })
   * ```
   */
  updateThreadSettings: (options: ConfigureOptions) => Promise<void>
  /** Stop the running turn, or the operation `operationId`. */
  cancel: (options?: CancelOptions) => Promise<void>
  /** Drop an input from `waitingInputs` before it runs. */
  cancelInput: (options: { inputId: string }) => Promise<void>
  /** Move a waiting input: `'steer'` joins the running turn, `'queue'` waits for its own turn. */
  changeInputDelivery: (change: {
    inputId: string
    delivery: WaitingInput['delivery']
  }) => Promise<void>
  /** Start a fresh model context. The model sees `note` first. */
  reset: (options?: ResetOptions) => Promise<void>
  /**
   * Go back to the message `messageId`. `unrevert` undoes it.
   *
   * @example
   * ```ts
   * await view.revert({ messageId: message.id })
   * ```
   */
  revert: (options: { messageId: string }) => Promise<void>
  unrevert: () => Promise<void>
  /**
   * Say yes to the approval `id`, maybe with changed arguments or data.
   *
   * @example
   * ```ts
   * view.approve({ id: approval.id })
   * ```
   */
  approve: (options: { id: string } & ApproveOptions) => void
  /**
   * Say no to the approval `id`. `payload` goes to the tool's approval
   * schema, when it has one.
   *
   * @example
   * ```ts
   * view.reject({ id: approval.id })
   * ```
   */
  reject: (options: { id: string; payload?: unknown }) => void
  approveAll: () => void
  rejectAll: () => void
  /**
   * Add a line of your own to the messages.
   *
   * @example
   * ```ts
   * view.notice({ text: 'Saved.' })
   * ```
   */
  notice: (options: { text: string }) => void
  /**
   * Fill the agent part `id` of a saved message with what that child wrote.
   * After a reload, a saved child shows only its card (name, status, result)
   * until you call this, for example when the user opens it. Its nested
   * children load the same way. Without `source.agentTranscript`, it does
   * nothing.
   *
   * @example
   * ```ts
   * await view.loadAgent({ id: part.id })
   * ```
   */
  loadAgent: (options: { id: string }) => Promise<void>
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

/** The shown form of a message, and the media parts it shows. */
interface ShownMessage {
  message: ViewMessage
  media: Array<MediaPart>
}

const isGap = ({ event }: SessionEvent) =>
  event.type === EventType.CUSTOM && event.name === HARNESS_EVENTS.gap

/**
 * Events after which the snapshot can differ. A config change is not in the
 * snapshot. A usage event changes only the usage, and the reducer adds it.
 */
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
    /^harness\.(operation|input|question|gap)/.test(event.name)
  )
}

/**
 * A usage event that the reducer could not add, and that the view does not
 * count yet: a call was missed, so the view reads the usage again.
 */
function missesUsage({ event }: SessionEvent, state: SessionViewState) {
  if (event.type !== EventType.CUSTOM || event.name !== HARNESS_EVENTS.usage)
    return false
  const { value } = event
  const total: unknown =
    typeof value === 'object' && value !== null && 'total' in value
      ? value.total
      : undefined
  const calls =
    typeof total === 'object' && total !== null && 'calls' in total
      ? total.calls
      : undefined
  return typeof calls !== 'number' || calls > (state.usage?.total.calls ?? 0)
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

function isOperation(value: unknown): value is Operation<unknown> {
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
  /**
   * The waits that no turn holds (the waits of background agent runs), by
   * id, from the last snapshot. Each one is answered on its own, not with
   * the interrupts of the turn.
   */
  let runWaits = new Map<string, PendingWait>()
  /** The waits of background runs whose answer is on its way. */
  const sending = new Set<string>()
  const chatTurns = new Set<string>()
  const agentNames = new Map<string, string>()
  const mediaParts = new Map<string, MediaPart>()
  const urlRefreshes = new Map<string, ReturnType<typeof setTimeout>>()
  /**
   * The shown form of each message, and the media parts it shows, by message
   * object. The reducer keeps a message that did not change, so a commit
   * walks only the new messages.
   */
  const shownOf = new WeakMap<ViewMessage, ShownMessage>()
  /** The agent parts of saved messages, that `loadAgent` can fill. */
  let savedAgents = new Set<string>()
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
    const entries = next.messages.map(withActions)
    const messages = keep(
      next.messages,
      entries.map((entry) => entry.message),
    )
    const shown = messages === next.messages ? next : { ...next, messages }
    // A media file that no message shows now (after a revert) needs no URL.
    const shownMedia = new Set(
      entries.flatMap((entry) => entry.media.map((part) => part.id)),
    )
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
  /** The receipt of a source call: an operation's receipt, or the call's result. */
  const receiptOf = (result: unknown): Promise<Receipt> => {
    if (!isOperation(result)) return Promise.resolve(result) as Promise<Receipt>
    result.then(undefined, () => {})
    return result.receipt
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
      const { url, expiresAt } = await source.mediaUrl({ id })
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
          ? source.loadMedia({ id })
          : Promise.reject(new Error('This session source cannot load media.')),
    }
    mediaParts.set(id, shown)
    void fetchUrl(id)
    return shown
  }
  /** The parts with the view's media parts. Each media part goes in `found`. */
  const partsWithActions = (
    parts: Array<ViewPart>,
    found: Array<MediaPart>,
  ): Array<ViewPart> =>
    keep(
      parts,
      parts.map((part) => {
        if (part.type === 'media') {
          const shown = mediaActions(part)
          found.push(shown)
          return shown
        }
        if (part.type !== 'agent') return part
        const inner = partsWithActions(part.parts, found)
        return inner === part.parts ? part : { ...part, parts: inner }
      }),
    )
  const messageWithActions = (
    message: ViewMessage,
    found: Array<MediaPart>,
  ) => {
    if (message.role === 'assistant') {
      const parts = partsWithActions(message.parts, found)
      return parts === message.parts ? message : { ...message, parts }
    }
    if (message.role !== 'user' || !message.media) return message
    const media = keep(
      message.media,
      message.media.map((part) => {
        const shown = mediaActions(part)
        found.push(shown)
        return shown
      }),
    )
    return media === message.media ? message : { ...message, media }
  }
  /**
   * The shown form of `message`. A known message is walked again only when
   * one of its media parts changed (a new URL) or went (after a revert).
   */
  const withActions = (message: ViewMessage): ShownMessage => {
    const known = shownOf.get(message)
    const isCurrent = known?.media.every(
      (part) => mediaParts.get(part.id) === part,
    )
    if (known && isCurrent) return known
    const media: Array<MediaPart> = []
    const entry = { message: messageWithActions(message, media), media }
    shownOf.set(message, entry)
    shownOf.set(entry.message, entry)
    return entry
  }

  /** `items` without the items that `drop` matches. */
  const without = <T extends { id: string }>(
    items: Array<T>,
    drop: (id: string) => boolean,
  ) =>
    keep(
      items,
      items.filter((item) => !drop(item.id)),
    )
  /** The state without the approvals, client tools, and interrupts `drop` matches. */
  const withoutItems = (drop: (id: string) => boolean) => {
    const state = get()
    return {
      ...state,
      approvals: without(state.approvals, drop),
      clientTools: without(state.clientTools, drop),
      interrupts: without(state.interrupts, drop),
    }
  }
  /**
   * Keep the answer to an item of `open`. One resume must answer every open
   * interrupt of the turn, so it goes when each approval and client tool of
   * the turn has an answer. A wait of a background agent run goes at once,
   * on its own.
   */
  const answer = (
    open: ReadonlyArray<{ id: string }>,
    entry: RunAgentResumeItem,
  ) => {
    alive()
    const id = entry.interruptId
    if (!open.some((item) => item.id === id)) return
    const wait = runWaits.get(id)
    if (wait !== undefined) {
      if (sending.has(id)) return
      sending.add(id)
      commit(withoutItems((item) => item === id))
      // A person answers a `human` wait with `answer`, which an operator
      // may send too. A wait with no interrupt takes only `answer`.
      const sent =
        (wait.kind === 'human' || !wait.interrupt) &&
        entry.status === 'resolved'
          ? source.answer({ questionId: id, value: entry.payload })
          : source.resolve({ resume: [entry] })
      void sent.then(refused, fail).finally(() => {
        sending.delete(id)
        refreshSnapshot()
      })
      return
    }
    if (resolving || decisions.has(id)) return
    decisions.set(id, entry)
    const { approvals, clientTools, interrupts } = get()
    const waiting = [...approvals, ...clientTools, ...interrupts].filter(
      (item) => !runWaits.has(item.id),
    )
    const resume = waiting.flatMap((item) => decisions.get(item.id) ?? [])
    if (resume.length < waiting.length) return
    decisions.clear()
    resolving = true
    commit(withoutItems((item) => !runWaits.has(item)))
    void source
      .resolve({ resume })
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
        reject: ({ payload } = {}) =>
          decide(interrupt.id, rejectedWith(payload)),
      }
    },
    interrupt: (interrupt) => {
      const open = () => get().interrupts
      const payload = interrupt.metadata?.[INTERRUPT_PAYLOAD_METADATA_KEY]
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
        return receiptOf(
          source.send(message, {
            to: operation.id,
            ...(options?.mode ? { mode: options.mode } : {}),
          }),
        )
      },
      cancel: () => {
        alive()
        return source.cancel({ operationId: operation.id })
      },
    }),
  }

  const takeSnapshot = (snapshot: SessionSnapshot, initial = false) => {
    runWaits = new Map(
      snapshot.pendingWaits.flatMap((wait) =>
        wait.turn ? [] : [[wait.waitId, wait] as const],
      ),
    )
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

  /** The ids of the agent parts in `messages` that show no parts yet. */
  const agentIdsIn = (messages: ReadonlyArray<ViewMessage>) =>
    emptyAgentsIn(messages).map((agent) => agent.id)

  /**
   * Fill the saved agent part `id` from the saved messages of its child. Its
   * nested children become saved agent parts too, and load on their own call.
   */
  const loadAgent = async (id: string): Promise<void> => {
    // A continued child has one id for each of its calls.
    const isWaiting = savedAgents.has(id) && !loadedAgents.has(id)
    if (!source.agentTranscript || !isWaiting) return
    loadedAgents.add(id)
    try {
      const messages = await source.agentTranscript({ subagentRunId: id })
      const parts = agentPartsFrom(messages)
      if (disposed) return
      // A child that failed before its first message has only its card.
      commit(withAgentParts(get(), id, parts, endOf(messages)))
      const inner = agentIdsIn([{ id, role: 'assistant', parts }])
      for (const child of inner) savedAgents.add(child)
    } catch (error) {
      // A later call can try again.
      loadedAgents.delete(id)
      fail(error)
    }
  }

  // A revert changes which saved messages show. The session is idle then.
  const refreshTranscript = coalesce(async () => {
    try {
      const transcript = await source.transcript()
      if (disposed) return
      const messages = messagesFromTranscript(transcript)
      commit({ ...get(), messages })
      // The children that loaded before load again, a parent before its
      // nested children.
      const loaded = [...loadedAgents]
      loadedAgents.clear()
      savedAgents = new Set(agentIdsIn(messages))
      for (const id of loaded) await loadAgent(id)
    } catch (error) {
      fail(error)
    }
  })

  /**
   * After a gap: the events of a part of the log are gone. Load the snapshot
   * and the transcript again, as `ready` does, while `read` waits. The
   * stream goes on after the gap's `resumeAt`. Its events up to the new
   * snapshot cursor replay only for the operations that run now, and the
   * parts that the transcript has are dropped by id.
   */
  const reload = async () => {
    try {
      // The snapshot before the transcript, as in `ready`.
      const snapshot = await source.snapshot()
      const transcript = await source.transcript()
      if (disposed) return
      commit({ ...get(), messages: messagesFromTranscript(transcript) })
      takeSnapshot(snapshot)
      saved = transcriptIds(transcript)
      held = []
      replayEnd = Number(snapshot.cursor)
      replayOps = new Set(snapshot.activeOperations.map((item) => item.id))
      // The children that loaded before load again, a parent before its
      // nested children. The events do not wait for them.
      const loaded = [...loadedAgents]
      loadedAgents.clear()
      savedAgents = new Set(agentIdsIn(get().messages))
      void (async () => {
        for (const id of loaded) await loadAgent(id)
      })()
    } catch (error) {
      fail(error)
    }
  }

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
      // A gap loads the transcript again too, in `read` (see `reload`).
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
        // A gap is not an event of an operation, so no replay drops it. No
        // event applies until the reload ends.
        if (isGap(entry)) {
          apply(entry)
          await reload()
        } else for (const ready of replayed(entry)) apply(ready)
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
    if (changesSnapshot(entry) || missesUsage(entry, after)) refreshSnapshot()
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
    savedAgents = new Set(agentIdsIn(get().messages))
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
    send: async (text, options = []) => {
      alive()
      const { attachments = [], as } = isAttachmentList(options)
        ? { attachments: options, as: undefined }
        : options
      const line = text.trim()
      if (line === '' && attachments.length === 0) return
      if (as === 'operator') {
        // An assistant message of the operator: the transcript has it.
        const message = userInput(line, attachments)
        await act(() => receiptOf(source.send(message, { as })))
        return
      }
      if (line.startsWith('/')) {
        const [name = '', ...rest] = line.slice(1).split(' ')
        const input = rest.join(' ').trim()
        settle(
          source.runCommand({ name, input: input === '' ? undefined : input }),
        )
        return
      }
      commit(withUserMessage(get(), line, attachments))
      const message = userInput(line, attachments)
      if (get().status === 'running') {
        await receiptOf(source.send(message, { mode: 'steer' })).then(
          refused,
          fail,
        )
        return
      }
      settle(source.send(message))
    },
    followUp: async (text, attachments = []) => {
      alive()
      const line = text.trim()
      if (line === '' && attachments.length === 0) return
      commit(withUserMessage(get(), line, attachments))
      const message = userInput(line, attachments)
      await act(() => receiptOf(source.send(message, { mode: 'followUp' })))
    },
    continueWithoutMessage: async () => {
      alive()
      settle(
        source.continueWithoutMessage
          ? source.continueWithoutMessage()
          : missing('continue'),
      )
    },
    putMedia: (file) => {
      alive()
      if (source.putMedia) return source.putMedia(file)
      return Promise.reject(new Error('This view source cannot store media.'))
    },
    runCommand: async (options) => {
      alive()
      settle(source.runCommand(options))
    },
    setPluginSetting: (change) => act(() => source.setPluginSetting(change)),
    updateThreadSettings: (options) =>
      act(() =>
        source.updateThreadSettings
          ? source.updateThreadSettings(options)
          : missing('configure'),
      ),
    cancel: (options) => act(() => source.cancel(options)),
    cancelInput: ({ inputId }) =>
      act(() =>
        source.cancelInput
          ? source.cancelInput({ inputId })
          : missing('cancel inputs'),
      ),
    changeInputDelivery: (change) =>
      act(() =>
        source.changeInputDelivery
          ? source.changeInputDelivery(change)
          : missing('move inputs'),
      ),
    reset: (options) =>
      act(() => (source.reset ? source.reset(options) : missing('reset'))),
    revert: ({ messageId }) =>
      act(() =>
        source.revert ? source.revert({ messageId }) : missing('revert'),
      ),
    unrevert: () =>
      act(() => (source.unrevert ? source.unrevert() : missing('unrevert'))),
    approve: ({ id, ...options }) =>
      decide(
        id,
        approvedWith(Object.keys(options).length > 0 ? options : undefined),
      ),
    reject: ({ id, payload }) => decide(id, rejectedWith(payload)),
    approveAll: () => decideAll(true),
    rejectAll: () => decideAll(false),
    notice: ({ text }) => {
      alive()
      commit(withNotice(get(), 'ui', text))
    },
    loadAgent: async ({ id }) => {
      alive()
      await ready
      await loadAgent(id)
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
