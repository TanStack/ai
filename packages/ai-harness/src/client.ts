// Browser-safe: this module has type-only imports from the rest of the
// package, plus `media-ref` and `utils`, which have no runtime imports
// themselves. So no server code (adapters, stores, secrets) reaches a client.
import { isMediaRecord } from './media-ref'
import { isRecord } from './utils'
import type { ModelMessage } from '@tanstack/ai'
import type {
  LogRecord,
  SessionIndexEntry,
  SessionIndexPage,
  SessionMember,
} from '@tanstack/ai-persistence'
import type { AgentInputOf } from './agents'
import type {
  AnyHarness,
  HarnessAgentsOf,
  HarnessToolInput,
  HarnessToolsOf,
  SessionMetadataOf,
} from './define'
import type { HostEvent } from './host'
import type { HarnessErrorCode } from './protocol'
import type { SessionDescription, SessionSnapshot } from './session/index'
import type { SessionEntryChange } from './session-entry'
import type {
  BusyPolicy,
  CancelOptions,
  CommandOptions,
  ConfigureOptions,
  Cursor,
  ForkPoint,
  HarnessInput,
  MediaRecord,
  MediaUpload,
  Receipt,
  ResetOptions,
  ResolveOptions,
  SessionEvent,
  UserInput,
  WaitingInput,
} from './types'

export {
  MEDIA_URL_PREFIX,
  kindOf,
  mediaIdOf,
  mediaOfMessage,
  mediaPart,
} from './media-ref'
export type { ForkPoint, MediaKind, MediaRecord } from './types'
export type { HarnessErrorCode } from './protocol'
export type {
  HostEvent,
  HostSessionDeletedEvent,
  HostSessionEvent,
  HostStatusEvent,
} from './host'

/**
 * A `harness.error` frame that ended a stream of the client: `code` says
 * what failed. `events()` and `hostEvents()` throw it. A `slow_consumer`
 * error is not thrown: they connect again.
 */
export class HarnessProtocolError extends Error {
  readonly code: HarnessErrorCode
  constructor(code: HarnessErrorCode, message: string) {
    super(message)
    this.name = 'HarnessProtocolError'
    this.code = code
  }
}

/**
 * The error of a `harness.error` frame. Undefined for another frame and
 * for `slow_consumer`: the stream ends, and the client connects again.
 */
function protocolErrorOf(frame: unknown): HarnessProtocolError | undefined {
  if (!isRecord(frame) || frame.type !== 'harness.error') return undefined
  if (frame.code === 'slow_consumer') return undefined
  const code =
    typeof frame.code === 'string'
      ? (frame.code as HarnessErrorCode)
      : 'internal'
  const message =
    typeof frame.message === 'string' ? frame.message : 'Harness stream failed'
  return new HarnessProtocolError(code, message)
}

export interface HarnessClientOptions {
  /** The base URL of `createHarnessHandler`, for example `/api/harness`. */
  url: string
  threadId: string
  /** Extra headers, for example `Authorization`. */
  headers?: Record<string, string> | (() => Record<string, string>)
  fetch?: typeof fetch
  /**
   * The first wait before a reconnect of `events()`. Default 1000 ms. Each
   * failed try after it doubles the wait, up to 30 s, with a random part.
   * A read from the server sets the wait back to this value.
   */
  reconnectDelayMs?: number
  /**
   * A connection of `events()` that gets no bytes for this long is dead,
   * for example after a laptop sleeps or a NAT drops the mapping. The
   * client closes it and connects again from its last cursor. Default
   * 60 000 ms. Keep it larger than the `stream.heartbeatMs` of the server
   * (default 20 000 ms), or the client reconnects in a loop.
   */
  idleTimeoutMs?: number
}

type StartArgs<TAgent> =
  AgentInputOf<TAgent> extends undefined
    ? [input?: undefined, options?: { detached?: boolean }]
    : [input: AgentInputOf<TAgent>, options?: { detached?: boolean }]

/** `client.agents`: start an exposed agent, typed from the harness. */
export type ClientAgentHandles<THarness> = {
  [TAgent in HarnessAgentsOf<THarness> as TAgent['name']]: {
    start: (...args: StartArgs<TAgent>) => Promise<Receipt>
  }
}

/** The options of `HarnessClient.send`. */
export type ClientSendOptions = {
  inputId?: string
  /**
   * A W3C `traceparent` of the caller, sent as the `traceparent` header.
   * The span of the turn on the server links it.
   */
  traceparent?: string
} & (
  | {
      to?: undefined
      mode?: 'prompt'
      busy?: BusyPolicy
      ephemeral?: ReadonlyArray<ModelMessage & { role: 'user' }>
      /** `'operator'`: an operator reply. See `SendOptions.as`. */
      as?: 'operator'
    }
  | {
      to?: undefined
      mode: 'steer' | 'followUp'
      busy?: never
      ephemeral?: never
      as?: never
    }
  | {
      to: string
      mode?: 'steer' | 'followUp'
      busy?: never
      ephemeral?: never
      as?: never
    }
)

export interface HarnessClient<THarness extends AnyHarness> {
  /**
   * Send a message, as `session.send` does. `mode` is `'prompt'` (default),
   * `'steer'` (join the running turn), or `'followUp'` (run after the
   * current work). `to` sends it to an agent run; the harness must list the
   * run's agent in `expose.agents`. `inputId` is an id you choose: a retry
   * with the same id and message gets the first receipt and does not run
   * again. `ephemeral` are messages for the model calls of a prompt only.
   * `as: 'operator'` is the reply of an operator while a handoff to a
   * person is open: no model runs. The sender needs the `operator` action.
   */
  send: (message: UserInput, options?: ClientSendOptions) => Promise<Receipt>
  /**
   * Start a turn from the stored transcript, with no new message. See
   * `session.continueWithoutMessage`.
   */
  continueWithoutMessage: (options?: {
    inputId?: string
    ephemeral?: ReadonlyArray<ModelMessage & { role: 'user' }>
  }) => Promise<Receipt>
  /**
   * Answer the waits of `snapshot().pendingWaits` that have an
   * `interrupt`, as `session.resolve` does. The waits of the last turn (the
   * approvals, the `question` tool calls, the client tools, and the
   * sign-ins) go in one resume. A wait of a background agent run takes a
   * resolve of its own. A wait with no interrupt takes `answer`.
   *
   * @example
   * ```ts
   * await client.resolve({ resume: [{ interruptId, status: 'resolved' }] })
   * ```
   */
  resolve: (options: ResolveOptions) => Promise<Receipt>
  /**
   * Stop the operation `operationId`, or the running turn without it, as
   * `session.cancel` does.
   *
   * @example
   * ```ts
   * await client.cancel({ operationId })
   * ```
   */
  cancel: (options?: CancelOptions) => Promise<Receipt>
  /**
   * Cancel an input that waits (see `snapshot().waitingInputs`). An input
   * that started is refused with `not_waiting`: use `cancel`.
   *
   * @example
   * ```ts
   * await client.cancelInput({ inputId })
   * ```
   */
  cancelInput: (options: { inputId: string }) => Promise<Receipt>
  /**
   * Move an input that waits: `'steer'` joins the running turn, `'queue'`
   * runs it as its own turn later.
   */
  changeInputDelivery: (change: {
    inputId: string
    delivery: WaitingInput['delivery']
  }) => Promise<Receipt>
  agents: ClientAgentHandles<THarness>
  /**
   * Answer a wait of `snapshot().pendingWaits` that no turn holds, as
   * `session.answer` does: a `step.ask` wait of a command, a durable tool,
   * or an agent run, an MCP question, or a `human` wait. The waits of the
   * stopped turn take `resolve`.
   */
  answer: (answer: { questionId: string; value: unknown }) => Promise<Receipt>
  /**
   * Run the plugin command `name`. Its result arrives as a
   * `harness.command.result` event.
   *
   * @example
   * ```ts
   * await client.runCommand({ name: 'mode', input: 'plan' })
   * ```
   */
  runCommand: (options: CommandOptions) => Promise<Receipt>
  /**
   * Run a harness tool with no model turn, as `session.runTool` does. The
   * harness must list it in `expose.tools`. `args` is typed from the
   * tool's input schema.
   *
   * @example
   * ```ts
   * await client.runTool({ name: 'sync_inbox', args: { folder: 'INBOX' } })
   * ```
   */
  runTool: <TName extends HarnessToolsOf<THarness>['name']>(options: {
    name: TName
    args?: HarnessToolInput<THarness, TName>
    meta?: Record<string, unknown>
    inputId?: string
  }) => Promise<Receipt>
  /**
   * Add host records to the session log, as `session.appendRecords` does. The
   * harness must list each record type in `expose.records`. With `inputId`,
   * a second append with the same id is a duplicate and writes nothing.
   *
   * @example
   * ```ts
   * await client.appendRecords({ records: [{ type: 'app.signal', text: 'Saved.' }] })
   * ```
   */
  appendRecords: (options: {
    records: ReadonlyArray<LogRecord>
    inputId?: string
  }) => Promise<Receipt>
  /** Change a session setting. */
  setPluginSetting: (change: {
    key: string
    value: unknown
  }) => Promise<Receipt>
  /**
   * Change the stored settings of the thread. See `session.updateThreadSettings`.
   *
   * @example
   * ```ts
   * await client.updateThreadSettings({ settings: { model: 'strong' } })
   * ```
   */
  updateThreadSettings: (options: ConfigureOptions) => Promise<Receipt>
  /**
   * Start a fresh model context from the next turn. The model sees `note`
   * first, when you give one. The transcript keeps every message.
   *
   * @example
   * ```ts
   * await client.reset({ note: 'The user wants a new plan.' })
   * ```
   */
  reset: (options?: ResetOptions) => Promise<Receipt>
  /**
   * Go back to the message `messageId`, as `session.revert` does. The
   * harness must list `'undo'` in `expose.commands`.
   *
   * @example
   * ```ts
   * await client.revert({ messageId })
   * ```
   */
  revert: (options: { messageId: string }) => Promise<Receipt>
  /** End the revert that stands, as `session.unrevert` does. */
  unrevert: () => Promise<Receipt>
  /**
   * The session events from `from` (exclusive). Without `from`, the events
   * start at the cursor of the snapshot: only new events come. Pass
   * `from: '0'` to read the events from the start. Reconnects after a network
   * error and resumes from the last cursor. Ends when `signal` aborts.
   * `onConnection` reports `'open'` for each connection and `'reconnecting'`
   * before each new try. When the log dropped the events after `from`, the
   * first event is a `harness.gap` (`HARNESS_EVENTS.gap`): load the snapshot
   * and the transcript again. A session view does this itself.
   */
  events: (options?: {
    from?: Cursor
    signal?: AbortSignal
    onConnection?: (state: 'open' | 'reconnecting') => void
  }) => AsyncIterable<SessionEvent>
  /**
   * The status changes and the session changes of all your sessions on the
   * server (`host.events()`). First the current status of each open session.
   * It ends when `signal` aborts or the server closes the stream. Call it
   * again to reconnect: the current statuses come first again.
   */
  hostEvents: (options?: { signal?: AbortSignal }) => AsyncIterable<HostEvent>
  snapshot: () => Promise<SessionSnapshot>
  /** The saved messages of the thread. */
  transcript: () => Promise<Array<ModelMessage>>
  /**
   * The saved messages of a child agent run of the thread, by its
   * `subagentRunId` or by its `runId`. Empty for an unknown id. A child with
   * no messages has one message with no content, with its card. See
   * `session.agentTranscript`.
   *
   * @example
   * ```ts
   * const messages = await client.agentTranscript({ subagentRunId })
   * ```
   */
  agentTranscript: (
    run: { subagentRunId: string } | { runId: string },
  ) => Promise<Array<ModelMessage>>
  /**
   * The commands, settings, and tools of the session. Only the commands in
   * `expose.commands` and the config keys in `expose.config`.
   */
  describe: () => Promise<SessionDescription>
  /**
   * Store a file in the media store of the thread. Send the record in a
   * prompt with `mediaPart(record)`. Throws when the handler refuses the
   * file, for example `413` for a file over the size limit.
   *
   * @example
   * ```ts
   * const record = await client.putMedia({ body: file, mimeType: file.type, name: file.name })
   * ```
   */
  putMedia: (
    file: MediaUpload<Blob | ArrayBuffer | Uint8Array>,
  ) => Promise<MediaRecord>
  /**
   * A signed URL for a media file, for `<img>`, `<audio>`, or `<video>`. It
   * stops working at `expiresAt` (epoch milliseconds). Ask again for a new one.
   *
   * @example
   * ```ts
   * const { url } = await client.mediaUrl({ id: record.id })
   * ```
   */
  mediaUrl: (options: {
    id: string
  }) => Promise<{ url?: string; expiresAt?: number }>
  /**
   * The bytes of the media file `id`.
   *
   * @example
   * ```ts
   * const bytes = await client.loadMedia({ id: record.id })
   * ```
   */
  loadMedia: (options: { id: string }) => Promise<Uint8Array>
  /**
   * Your sessions on the server, as `host.sessions` has them for the
   * user of the request.
   *
   * @example
   * ```ts
   * const page = await client.sessions.list({ limit: 20 })
   * await client.sessions.rename({ threadId: 't-1', title: 'Trip plan' })
   * await client.sessions.delete({ threadId: 't-1' })
   * ```
   */
  sessions: HarnessClientSessions<THarness>
}

/** The sessions of the user of a `HarnessClient`. See `client.sessions`. */
export interface HarnessClientSessions<THarness extends AnyHarness> {
  /**
   * One page of your sessions, newest first. Default: top-level sessions.
   * Pass `parentThreadId` to get the child sessions of a thread, and the
   * `cursor` of a page to get the next page. `search` keeps the sessions
   * whose title contains the text, without case. `metadata` keeps the
   * sessions with each exact metadata value.
   */
  list: (options?: {
    limit?: number
    cursor?: string
    parentThreadId?: string
    search?: string
    metadata?: Record<string, string>
  }) => Promise<
    Omit<SessionIndexPage, 'entries'> & {
      entries: Array<SessionIndexEntry<SessionMetadataOf<THarness>>>
    }
  >
  /** Set the title of one of your sessions. Resolves to the changed entry. */
  rename: (change: {
    threadId: string
    title: string
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>>>
  /**
   * Change the `title`, `pinned`, or `metadata` of one of your sessions, for
   * example the context items a user pinned in the composer. Each field you
   * pass besides `threadId` replaces the stored one. The harness `metadataSchema` checks
   * `metadata` on the server. Resolves to the changed entry.
   */
  update: (
    change: { threadId: string } & SessionEntryChange<
      SessionMetadataOf<THarness>
    >,
  ) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>>>
  /**
   * Remove one of your sessions from the session index. The transcript and
   * the other data of the thread stay on the server.
   */
  delete: (options: { threadId: string }) => Promise<void>
  /**
   * Copy one of your sessions into a new session, up to a message id.
   * Resolves to the entry of the new session.
   */
  fork: (options: {
    threadId: string
    at: ForkPoint
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>>>
  /**
   * Add the user `userId` to the members of one of your sessions with
   * `role`, or change the role of a member. The server needs
   * `access.rules.members`, and you need the `share` action. Resolves to
   * the changed entry.
   */
  share: (change: {
    threadId: string
    userId: string
    role: SessionMember['role']
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>>>
  /**
   * Remove the user `userId` from the members of one of your sessions. The
   * streams of that user close. Resolves to the changed entry.
   */
  unshare: (change: {
    threadId: string
    userId: string
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>>>
}

/** The body of `POST sessions`. */
type SessionChange =
  | { op: 'rename'; threadId: string; title: string }
  | ({ op: 'update'; threadId: string } & SessionEntryChange<unknown>)
  | { op: 'delete'; threadId: string }
  | ({ op: 'fork'; threadId: string } & ForkPoint)
  | {
      op: 'share'
      threadId: string
      userId: string
      role: SessionMember['role']
    }
  | { op: 'unshare'; threadId: string; userId: string }

/** The longest wait before a reconnect of `events()`. */
const MAX_RECONNECT_DELAY_MS = 30_000

/**
 * The default `idleTimeoutMs`: 3 times the default `stream.heartbeatMs` of
 * the server, so a live connection always sends bytes before it.
 */
const IDLE_TIMEOUT_MS = 60_000

/**
 * The wait before reconnect number `attempt` (0 is the first): `base`
 * doubled for each attempt, up to 30 s. A random part takes up to half of
 * it away, so many clients do not reconnect at the same time.
 */
function reconnectDelay(base: number, attempt: number) {
  const full = Math.min(MAX_RECONNECT_DELAY_MS, base * 2 ** attempt)
  return full / 2 + (full / 2) * Math.random()
}

/** Run `stop` when `signal` aborts. Returns the function that removes it. */
function whenAborted(signal: AbortSignal | undefined, stop: () => void) {
  if (!signal) return () => {}
  signal.addEventListener('abort', stop, { once: true })
  return () => signal.removeEventListener('abort', stop)
}

/** Stop the read of an SSE body. Some fetch shims ignore the signal then. */
function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
) {
  reader?.cancel().catch(() => {})
}

/**
 * An SSE parser that reads a stream as the SSE spec does. Give it the text
 * as it comes. It returns the `data` of each event that the text ends.
 *
 * - A line ends with CR, LF, or CRLF, also when a CRLF is split across two
 *   reads.
 * - The `data` lines of one event are joined with `\n`. One space after the
 *   colon is not part of the value.
 * - A line that starts with `:` is a comment.
 * - Only the new text is read. The part after the last line end is kept.
 */
function sseParser() {
  let line = ''
  let data: string | undefined
  // The last text ended with CR. An LF at the start of the next text ends
  // the same line, so it is skipped.
  let afterCr = false
  const endLine = (text: string, events: Array<string>) => {
    if (text === '') {
      if (data !== undefined) events.push(data)
      data = undefined
      return
    }
    if (text.startsWith(':')) return
    const colon = text.indexOf(':')
    const field = colon < 0 ? text : text.slice(0, colon)
    // The client reads only `data`. `id`, `event`, and `retry` are left out.
    if (field !== 'data') return
    const raw = colon < 0 ? '' : text.slice(colon + 1)
    const value = raw.startsWith(' ') ? raw.slice(1) : raw
    data = data === undefined ? value : `${data}\n${value}`
  }
  return (text: string) => {
    const events: Array<string> = []
    let start = afterCr && text.startsWith('\n') ? 1 : 0
    afterCr = false
    const ends = /\r\n|\r|\n/g
    ends.lastIndex = start
    let match = ends.exec(text)
    while (match) {
      endLine(line + text.slice(start, match.index), events)
      line = ''
      start = match.index + match[0].length
      afterCr = match[0] === '\r' && start === text.length
      match = ends.exec(text)
    }
    line += text.slice(start)
    return events
  }
}

/**
 * The `data` of each event of an SSE body, as parsed JSON. `onRead` runs
 * for each chunk the server sends.
 */
async function* sseFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onRead?: () => void,
) {
  const decoder = new TextDecoder()
  const parse = sseParser()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return
      onRead?.()
      const events = parse(decoder.decode(value, { stream: true }))
      for (const data of events) {
        // An event with an empty `data` has no frame.
        if (data === '') continue
        const frame: unknown = JSON.parse(data)
        yield frame
      }
    }
  } finally {
    // A reader that stops early closes the connection, so the server stops.
    cancelReader(reader)
  }
}

// The answer of `GET media-url`: a signed path, relative to the base URL.
function isSignedPath(
  value: unknown,
): value is { path: string; expiresAt: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number'
  )
}

/**
 * A client for a harness session served by `createHarnessHandler`. Pass the
 * harness type for typed agents: `createHarnessClient<typeof studio>(...)`.
 * Import the harness with `import type`, so it stays out of the bundle.
 */
export function createHarnessClient<THarness extends AnyHarness>(
  options: HarnessClientOptions,
): HarnessClient<THarness> {
  const base = options.url.replace(/\/$/, '')
  const doFetch = options.fetch ?? fetch
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS
  const headers = () =>
    typeof options.headers === 'function'
      ? options.headers()
      : (options.headers ?? {})

  // The handler answers a refusal with `{ error }`. Any other body falls
  // back to the status text.
  const failure = (action: string, response: Response, body: unknown) => {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String(body.error)
        : response.statusText
    return new Error(
      `Harness ${action} failed (${response.status}): ${message}`,
    )
  }

  // The response when it is a success. Else it throws with the `{ error }`
  // of the handler.
  const checked = async (action: string, response: Response) => {
    if (response.ok) return response
    // A proxy can refuse a request with a page, not JSON.
    const refusal: unknown = await response.json().catch(() => undefined)
    throw failure(action, response, refusal)
  }

  const send = async (
    input: HarnessInput,
    traceparent?: string,
  ): Promise<Receipt> => {
    // In `cancelInput` and `setDelivery`, `inputId` is the input to change.
    const namesOther = input.op === 'cancelInput' || input.op === 'setDelivery'
    // Each input gets an id, so a retry of the same request is the same
    // input: the handler answers it with the first receipt.
    const withId =
      namesOther || input.inputId ? input : { ...input, inputId: newInputId() }
    const response = await doFetch(`${base}/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers(),
        ...(traceparent ? { traceparent } : {}),
      },
      body: JSON.stringify({ threadId: options.threadId, input: withId }),
    })
    const body: unknown = await (await checked('request', response)).json()
    // The handler answers /control with a Receipt.
    return body as Receipt
  }

  const get = async (route: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams({ threadId: options.threadId, ...params })
    const response = await doFetch(`${base}/${route}?${query}`, {
      headers: headers(),
    })
    if (!response.ok)
      throw new Error(`Harness ${route} failed (${response.status})`)
    return response
  }

  const read = async <T>(route: string, params?: Record<string, string>) =>
    // Each GET route answers with the type of the `HarnessClient` member
    // that reads it. That member type sets `T`.
    (await (await get(route, params)).json()) as T

  const putMedia = async ({
    body,
    mimeType,
    name,
  }: MediaUpload<Blob | ArrayBuffer | Uint8Array>) => {
    const query = new URLSearchParams({
      threadId: options.threadId,
      name,
    })
    const response = await doFetch(`${base}/media?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, ...headers() },
      // fetch refuses a view on a SharedArrayBuffer. ponytail: a Uint8Array
      // is copied once; skip the copy when `body.buffer` is an ArrayBuffer
      // if big uploads from bytes (not a Blob or File) ever matter.
      body: body instanceof Uint8Array ? body.slice() : body,
    })
    await checked('upload', response)
    const stored: unknown = await response.json()
    if (!isMediaRecord(stored))
      throw new Error('Harness upload failed: the answer is not a media record')
    return stored
  }

  const mediaUrl = async ({ id }: { id: string }) => {
    const body: unknown = await (await get('media-url', { id })).json()
    if (!isSignedPath(body))
      throw new Error('Harness media-url failed: the answer has no signed path')
    return { url: `${base}/${body.path}`, expiresAt: body.expiresAt }
  }

  const loadMedia = async ({ id }: { id: string }) =>
    new Uint8Array(await (await get('media', { id })).arrayBuffer())

  // `POST sessions`: rename, delete, fork, or share a session of this user.
  const changeSession = async (change: SessionChange) =>
    checked(
      'sessions',
      await doFetch(`${base}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(change),
      }),
    )

  const sessionEntry = async (change: SessionChange) =>
    // The handler answers each op but a delete with the entry.
    // The server schema checked its metadata.
    (await (await changeSession(change)).json()) as SessionIndexEntry<
      SessionMetadataOf<THarness>
    >

  async function* events(
    eventOptions: {
      from?: Cursor
      signal?: AbortSignal
      onConnection?: (state: 'open' | 'reconnecting') => void
    } = {},
  ) {
    let cursor = eventOptions.from
    const signal = eventOptions.signal
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    // Ends the wait before a reconnect.
    let wake: (() => void) | undefined
    // Closes a connection that sends nothing for `idleTimeoutMs`.
    let idle: ReturnType<typeof setTimeout> | undefined
    // One listener for all the connections: it stops the current read or
    // the current wait.
    const stopListening = whenAborted(signal, () => {
      cancelReader(reader)
      wake?.()
    })
    // The tries since the last read from the server, for the next wait.
    let attempt = 0
    // The error of a /snapshot answer with the wrong shape. It is not retried.
    let badSnapshot: Error | undefined
    try {
      while (!signal?.aborted) {
        try {
          const query = new URLSearchParams({ threadId: options.threadId })
          // No `from`: start at the head, so the stream does not send the
          // whole history first. A thread with no entry has no events yet.
          if (cursor === undefined) {
            const head = await doFetch(`${base}/snapshot?${query}`, {
              headers: headers(),
              ...(signal ? { signal } : {}),
            })
            if (head.status === 404) cursor = '0'
            else if (!head.ok) {
              throw new Error(`Harness snapshot failed (${head.status})`)
            } else {
              const body: unknown = await head.json()
              if (!isRecord(body) || typeof body.cursor !== 'string') {
                // A retry gets the same answer, so stop the read.
                badSnapshot = new Error(
                  `Harness snapshot has no string "cursor". Is ${base} a harness handler?`,
                )
                throw badSnapshot
              }
              cursor = body.cursor
            }
          }
          if (cursor) query.set('from', cursor)
          const response = await doFetch(`${base}/events?${query}`, {
            headers: headers(),
            ...(signal ? { signal } : {}),
          })
          if (!response.ok || !response.body) {
            throw new Error(`Harness events failed (${response.status})`)
          }
          eventOptions.onConnection?.('open')
          const connection = response.body.getReader()
          reader = connection
          // Each read, a ping too, shows that the connection is alive. A
          // cancel ends the read, and the loop below connects again.
          const isAlive = () => {
            clearTimeout(idle)
            idle = setTimeout(() => cancelReader(connection), idleTimeoutMs)
          }
          isAlive()
          const frames = sseFrames(reader, () => {
            attempt = 0
            isAlive()
          })
          for await (const frame of frames) {
            const failure = protocolErrorOf(frame)
            if (failure) throw failure
            if (
              typeof frame === 'object' &&
              frame !== null &&
              'type' in frame &&
              frame.type === 'harness.event' &&
              'cursor' in frame &&
              typeof frame.cursor === 'string'
            ) {
              cursor = frame.cursor
              // The handler sends `{ type, cursor, operationId, event }`.
              const { type: _type, ...entry } = frame as SessionEvent & {
                type: string
              }
              yield entry
            }
          }
        } catch (error) {
          if (signal?.aborted) return
          if (error === badSnapshot) throw error
          if (error instanceof HarnessProtocolError) throw error
          // A 404 means that the thread has no entry yet: a new chat, before
          // its first message. Try again, the same as after a network error.
          if (error instanceof Error && /\((401|403)\)/.test(error.message))
            throw error
        } finally {
          clearTimeout(idle)
        }
        if (signal?.aborted) return
        eventOptions.onConnection?.('reconnecting')
        const wait = reconnectDelay(options.reconnectDelayMs ?? 1000, attempt)
        attempt += 1
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, wait)
          wake = () => {
            clearTimeout(timer)
            resolve()
          }
        })
        wake = undefined
      }
    } finally {
      stopListening()
    }
  }

  async function* hostEvents({ signal }: { signal?: AbortSignal } = {}) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const stopListening = whenAborted(signal, () => cancelReader(reader))
    try {
      // A `slow_consumer` error ends the stream: connect again. The current
      // statuses come first again.
      let isSlow = true
      while (isSlow && !signal?.aborted) {
        isSlow = false
        const response = await checked(
          'host-events',
          await doFetch(`${base}/host-events`, {
            headers: headers(),
            ...(signal ? { signal } : {}),
          }),
        )
        if (!response.body)
          throw new Error('Harness host-events failed: the answer has no body')
        reader = response.body.getReader()
        for await (const frame of sseFrames(reader)) {
          // The handler sends `HostEvent` frames, and `harness.*` frames
          // (the hello first, an error last) that are not host events.
          const type = isRecord(frame) ? frame.type : undefined
          if (type === 'harness.error') {
            const failure = protocolErrorOf(frame)
            if (failure) throw failure
            isSlow = true
          } else if (typeof type !== 'string' || !type.startsWith('harness.')) {
            yield frame as HostEvent
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) return
      throw error
    } finally {
      stopListening()
    }
  }

  const agents = new Proxy({} as ClientAgentHandles<THarness>, {
    get: (_target, name) =>
      typeof name === 'string'
        ? {
            start: (input?: unknown, startOptions?: { detached?: boolean }) =>
              send({
                op: 'agent',
                agent: name,
                input,
                ...(startOptions?.detached ? { detached: true } : {}),
              }),
          }
        : undefined,
  })

  return {
    send: (message, sendOptions) => {
      const inputId = sendOptions?.inputId
        ? { inputId: sendOptions.inputId }
        : {}
      if (sendOptions?.to !== undefined) {
        return send({
          op: 'agentMessage',
          operationId: sendOptions.to,
          message,
          ...(sendOptions.mode ? { mode: sendOptions.mode } : {}),
          ...inputId,
        })
      }
      const mode = sendOptions?.mode ?? 'prompt'
      const traceparent = sendOptions?.traceparent
      if (mode !== 'prompt') {
        return send({ op: mode, message, ...inputId }, traceparent)
      }
      return send(
        {
          op: 'prompt',
          message,
          ...(sendOptions?.busy ? { busy: sendOptions.busy } : {}),
          ...(sendOptions?.ephemeral
            ? { ephemeral: sendOptions.ephemeral }
            : {}),
          ...(sendOptions?.as ? { as: sendOptions.as } : {}),
          ...inputId,
        },
        traceparent,
      )
    },
    continueWithoutMessage: (continueOptions) =>
      send({
        op: 'continue',
        ...(continueOptions?.inputId
          ? { inputId: continueOptions.inputId }
          : {}),
        ...(continueOptions?.ephemeral
          ? { ephemeral: continueOptions.ephemeral }
          : {}),
      }),
    resolve: ({ resume, inputId }) =>
      send({ op: 'resolve', resume, ...(inputId ? { inputId } : {}) }),
    cancel: ({ operationId } = {}) =>
      send({ op: 'cancel', ...(operationId ? { operationId } : {}) }),
    cancelInput: ({ inputId }) => send({ op: 'cancelInput', inputId }),
    changeInputDelivery: ({ inputId, delivery }) =>
      send({ op: 'setDelivery', inputId, delivery }),
    agents,
    answer: ({ questionId, value }) =>
      send({ op: 'answer', questionId, value }),
    runCommand: ({ name, input }) => send({ op: 'command', name, input }),
    runTool: ({ name, args, meta, inputId }) =>
      send({
        op: 'tool',
        name,
        ...(args !== undefined ? { args } : {}),
        ...(meta ? { meta } : {}),
        ...(inputId ? { inputId } : {}),
      }),
    appendRecords: ({ records, inputId }) =>
      send({
        op: 'append',
        records: [...records],
        ...(inputId ? { inputId } : {}),
      }),
    setPluginSetting: ({ key, value }) => send({ op: 'config', key, value }),
    updateThreadSettings: ({ settings, inputId }) =>
      send({ op: 'configure', settings, ...(inputId ? { inputId } : {}) }),
    reset: ({ note, inputId } = {}) =>
      send({
        op: 'reset',
        ...(note !== undefined ? { note } : {}),
        ...(inputId ? { inputId } : {}),
      }),
    revert: ({ messageId }) => send({ op: 'revert', messageId }),
    unrevert: () => send({ op: 'unrevert' }),
    events,
    hostEvents,
    snapshot: () => read('snapshot'),
    transcript: () => read('transcript'),
    agentTranscript: (run) =>
      read(
        'agent-transcript',
        'subagentRunId' in run
          ? { subagentRunId: run.subagentRunId }
          : { runId: run.runId },
      ),
    describe: () => read('describe'),
    putMedia,
    mediaUrl,
    loadMedia,
    sessions: {
      list: async ({
        limit,
        cursor,
        parentThreadId,
        search,
        metadata = {},
      } = {}) => {
        const query = new URLSearchParams()
        if (limit !== undefined) query.set('limit', String(limit))
        if (cursor) query.set('cursor', cursor)
        if (parentThreadId) query.set('parentThreadId', parentThreadId)
        if (search) query.set('search', search)
        for (const [key, value] of Object.entries(metadata))
          query.set(`metadata.${key}`, value)
        const response = await checked(
          'sessions',
          await doFetch(`${base}/sessions?${query}`, { headers: headers() }),
        )
        // The handler answers with one page of the session index.
        return (await response.json()) as Omit<SessionIndexPage, 'entries'> & {
          entries: Array<SessionIndexEntry<SessionMetadataOf<THarness>>>
        }
      },
      rename: ({ threadId, title }) =>
        sessionEntry({ op: 'rename', threadId, title }),
      update: (change) => sessionEntry({ ...change, op: 'update' }),
      delete: async ({ threadId }) => {
        await changeSession({ op: 'delete', threadId })
      },
      fork: ({ threadId, at }) => sessionEntry({ op: 'fork', threadId, ...at }),
      share: ({ threadId, userId, role }) =>
        sessionEntry({ op: 'share', threadId, userId, role }),
      unshare: ({ threadId, userId }) =>
        sessionEntry({ op: 'unshare', threadId, userId }),
    },
  }
}

// Browsers expose `crypto.randomUUID` only on HTTPS and localhost. The id
// only has to be unique, so plain HTTP falls back to random digits.
function newInputId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}
