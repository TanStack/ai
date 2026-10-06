// Browser-safe: this module has type-only imports from the rest of the
// package, plus `media-ref`, which has type-only imports itself. So no server
// code (adapters, stores, secrets) reaches a client.
import { isMediaRecord } from './media-ref'
import type { ModelMessage, RunAgentResumeItem } from '@tanstack/ai'
import type {
  SessionIndexEntry,
  SessionIndexPage,
} from '@tanstack/ai-persistence'
import type { AgentInputOf } from './agents'
import type { AnyHarness, HarnessAgentsOf } from './define'
import type { HostEvent } from './host'
import type { SessionDescription, SessionSnapshot } from './session'
import type {
  BusyPolicy,
  Cursor,
  ForkPoint,
  HarnessInput,
  MediaRecord,
  Receipt,
  SessionEvent,
  ThreadSettingsChange,
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
export type {
  HostEvent,
  HostSessionDeletedEvent,
  HostSessionEvent,
  HostStatusEvent,
} from './host'

export interface HarnessClientOptions {
  /** The base URL of `createHarnessHandler`, for example `/api/harness`. */
  url: string
  threadId: string
  /** Extra headers, for example `Authorization`. */
  headers?: Record<string, string> | (() => Record<string, string>)
  fetch?: typeof fetch
  /** Wait before a reconnect of `events()`. Default 1000 ms. */
  reconnectDelayMs?: number
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

export interface HarnessClient<THarness extends AnyHarness> {
  /**
   * Send a prompt. `inputId` is an id you choose: a retry with the same id
   * and message gets the first receipt and does not run again.
   */
  prompt: (
    message: UserInput,
    options?: { busy?: BusyPolicy; inputId?: string },
  ) => Promise<Receipt>
  steer: (
    message: UserInput,
    options?: { inputId?: string },
  ) => Promise<Receipt>
  followUp: (
    message: UserInput,
    options?: { inputId?: string },
  ) => Promise<Receipt>
  resolve: (resume: Array<RunAgentResumeItem>) => Promise<Receipt>
  cancel: (operationId?: string) => Promise<Receipt>
  /**
   * Cancel an input that waits (see `snapshot().waitingInputs`). An input
   * that started is refused with `not_waiting`: use `cancel`.
   */
  cancelInput: (inputId: string) => Promise<Receipt>
  /**
   * Move an input that waits: `'steer'` joins the running turn, `'queue'`
   * runs it as its own turn later.
   */
  setDelivery: (
    inputId: string,
    delivery: WaitingInput['delivery'],
  ) => Promise<Receipt>
  agents: ClientAgentHandles<THarness>
  /** Answer a question from a command or a plugin. */
  answer: (questionId: string, value: unknown) => Promise<Receipt>
  /** Run a plugin command. Its result arrives as a `harness.command.result` event. */
  command: (name: string, input?: unknown) => Promise<Receipt>
  /** Change a session setting. */
  setConfig: (key: string, value: unknown) => Promise<Receipt>
  /** Change the stored settings of the thread. See `session.configure`. */
  configure: (settings: ThreadSettingsChange) => Promise<Receipt>
  /**
   * Start a fresh model context from the next turn. The model sees `note`
   * first, when you give one. The transcript keeps every message.
   */
  reset: (note?: string, options?: { inputId?: string }) => Promise<Receipt>
  /**
   * The session events from `from` (exclusive). Reconnects after a network
   * error and resumes from the last cursor. Ends when `signal` aborts.
   * `onConnection` reports `'open'` for each connection and `'reconnecting'`
   * before each new try.
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
  /** The commands, settings, and tools of the session. */
  describe: () => Promise<SessionDescription>
  /**
   * Store a file in the media store of the thread. Send the record in a
   * prompt with `mediaPart(record)`. Throws when the handler refuses the
   * file, for example `413` for a file over the size limit.
   */
  upload: (
    body: Blob | ArrayBuffer | Uint8Array,
    info: { name: string; mimeType: string },
  ) => Promise<MediaRecord>
  /**
   * A signed URL for a media file, for `<img>`, `<audio>`, or `<video>`. It
   * stops working at `expiresAt` (epoch milliseconds). Ask again for a new one.
   */
  mediaUrl: (id: string) => Promise<{ url?: string; expiresAt?: number }>
  /** The bytes of a media file. */
  loadMedia: (id: string) => Promise<Uint8Array>
  /**
   * One page of your sessions, newest first. Default: top-level sessions.
   * Pass `parentThreadId` to get the child sessions of a thread, and the
   * `cursor` of a page to get the next page.
   */
  listSessions: (options?: {
    limit?: number
    cursor?: string
    parentThreadId?: string
  }) => Promise<SessionIndexPage>
  /** Set the title of one of your sessions. Resolves to the changed entry. */
  renameSession: (threadId: string, title: string) => Promise<SessionIndexEntry>
  /**
   * Remove one of your sessions from the session index. The transcript and
   * the other data of the thread stay on the server.
   */
  deleteSession: (threadId: string) => Promise<void>
  /**
   * Copy one of your sessions into a new session, up to a message id.
   * Resolves to the entry of the new session.
   */
  forkSession: (threadId: string, at: ForkPoint) => Promise<SessionIndexEntry>
}

/** The body of `POST sessions`. */
type SessionChange =
  | { op: 'rename'; threadId: string; title: string }
  | { op: 'delete'; threadId: string }
  | ({ op: 'fork'; threadId: string } & ForkPoint)

/** The `data` of each event of an SSE body, as parsed JSON. */
async function* sseFrames(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
) {
  const reader = body.getReader()
  // Some fetch shims ignore the signal once the body streams.
  signal?.addEventListener('abort', () => void reader.cancel(), {
    once: true,
  })
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const data = block
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6)
        if (!data) continue
        const frame: unknown = JSON.parse(data)
        yield frame
      }
    }
  } finally {
    // A reader that stops early closes the connection, so the server stops.
    reader.cancel().catch(() => {})
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

  const send = async (input: HarnessInput): Promise<Receipt> => {
    const response = await doFetch(`${base}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ threadId: options.threadId, input }),
    })
    const body: unknown = await response.json()
    if (!response.ok) throw failure('request', response, body)
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

  const read = async <T>(route: string) =>
    // Each GET route answers with the type of the `HarnessClient` member
    // that reads it. That member type sets `T`.
    (await (await get(route)).json()) as T

  const upload = async (
    body: Blob | ArrayBuffer | Uint8Array,
    info: { name: string; mimeType: string },
  ) => {
    const query = new URLSearchParams({
      threadId: options.threadId,
      name: info.name,
    })
    const response = await doFetch(`${base}/media?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': info.mimeType, ...headers() },
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

  const mediaUrl = async (id: string) => {
    const body: unknown = await (await get('media-url', { id })).json()
    if (!isSignedPath(body))
      throw new Error('Harness media-url failed: the answer has no signed path')
    return { url: `${base}/${body.path}`, expiresAt: body.expiresAt }
  }

  const loadMedia = async (id: string) =>
    new Uint8Array(await (await get('media', { id })).arrayBuffer())

  // `POST sessions`: rename, delete, or fork a session of this user.
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
    // The handler answers a rename and a fork with the entry.
    (await (await changeSession(change)).json()) as SessionIndexEntry

  async function* events(
    eventOptions: {
      from?: Cursor
      signal?: AbortSignal
      onConnection?: (state: 'open' | 'reconnecting') => void
    } = {},
  ) {
    let cursor = eventOptions.from
    const signal = eventOptions.signal
    while (!signal?.aborted) {
      try {
        const query = new URLSearchParams({ threadId: options.threadId })
        if (cursor) query.set('from', cursor)
        const response = await doFetch(`${base}/events?${query}`, {
          headers: headers(),
          ...(signal ? { signal } : {}),
        })
        if (!response.ok || !response.body) {
          throw new Error(`Harness events failed (${response.status})`)
        }
        eventOptions.onConnection?.('open')
        for await (const frame of sseFrames(response.body, signal)) {
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
        if (error instanceof Error && /\((401|403|404)\)/.test(error.message))
          throw error
      }
      if (signal?.aborted) return
      eventOptions.onConnection?.('reconnecting')
      await new Promise((resolve) =>
        setTimeout(resolve, options.reconnectDelayMs ?? 1000),
      )
    }
  }

  async function* hostEvents({ signal }: { signal?: AbortSignal } = {}) {
    try {
      const response = await checked(
        'host-events',
        await doFetch(`${base}/host-events`, {
          headers: headers(),
          ...(signal ? { signal } : {}),
        }),
      )
      if (!response.body)
        throw new Error('Harness host-events failed: the answer has no body')
      for await (const frame of sseFrames(response.body, signal)) {
        // The handler sends `HostEvent` frames only.
        yield frame as HostEvent
      }
    } catch (error) {
      if (signal?.aborted) return
      throw error
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
    prompt: (message, promptOptions) =>
      send({
        op: 'prompt',
        message,
        ...(promptOptions?.busy ? { busy: promptOptions.busy } : {}),
        ...(promptOptions?.inputId ? { inputId: promptOptions.inputId } : {}),
      }),
    steer: (message, steerOptions) =>
      send({
        op: 'steer',
        message,
        ...(steerOptions?.inputId ? { inputId: steerOptions.inputId } : {}),
      }),
    followUp: (message, followOptions) =>
      send({
        op: 'followUp',
        message,
        ...(followOptions?.inputId ? { inputId: followOptions.inputId } : {}),
      }),
    resolve: (resume) => send({ op: 'resolve', resume }),
    cancel: (operationId) =>
      send({ op: 'cancel', ...(operationId ? { operationId } : {}) }),
    cancelInput: (inputId) => send({ op: 'cancelInput', inputId }),
    setDelivery: (inputId, delivery) =>
      send({ op: 'setDelivery', inputId, delivery }),
    agents,
    answer: (questionId, value) => send({ op: 'answer', questionId, value }),
    command: (name, input) => send({ op: 'command', name, input }),
    setConfig: (key, value) => send({ op: 'config', key, value }),
    configure: (settings) => send({ op: 'configure', settings }),
    reset: (note, resetOptions) =>
      send({
        op: 'reset',
        ...(note !== undefined ? { note } : {}),
        ...(resetOptions?.inputId ? { inputId: resetOptions.inputId } : {}),
      }),
    events,
    hostEvents,
    snapshot: () => read('snapshot'),
    transcript: () => read('transcript'),
    describe: () => read('describe'),
    upload,
    mediaUrl,
    loadMedia,
    listSessions: async ({ limit, cursor, parentThreadId } = {}) => {
      const query = new URLSearchParams()
      if (limit !== undefined) query.set('limit', String(limit))
      if (cursor) query.set('cursor', cursor)
      if (parentThreadId) query.set('parentThreadId', parentThreadId)
      const response = await checked(
        'sessions',
        await doFetch(`${base}/sessions?${query}`, { headers: headers() }),
      )
      // The handler answers with one page of the session index.
      return (await response.json()) as SessionIndexPage
    },
    renameSession: (threadId, title) =>
      sessionEntry({ op: 'rename', threadId, title }),
    deleteSession: async (threadId) => {
      await changeSession({ op: 'delete', threadId })
    },
    forkSession: (threadId, at) =>
      sessionEntry({ op: 'fork', threadId, ...at }),
  }
}
