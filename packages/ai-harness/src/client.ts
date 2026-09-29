// Browser-safe: this module has type-only imports from the rest of the
// package, plus `media-ref`, which has type-only imports itself. So no server
// code (adapters, stores, secrets) reaches a client.
import { isMediaRecord } from './media-ref'
import type { ModelMessage, RunAgentResumeItem } from '@tanstack/ai'
import type { AgentInputOf } from './agents'
import type { AnyHarness, HarnessAgentsOf } from './define'
import type { SessionDescription, SessionSnapshot } from './session'
import type {
  BusyPolicy,
  Cursor,
  HarnessInput,
  MediaRecord,
  Receipt,
  SessionEvent,
  UserInput,
} from './types'

export {
  MEDIA_URL_PREFIX,
  kindOf,
  mediaIdOf,
  mediaOfMessage,
  mediaPart,
} from './media-ref'
export type { MediaKind, MediaRecord } from './types'

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
  prompt: (
    message: UserInput,
    options?: { busy?: BusyPolicy },
  ) => Promise<Receipt>
  steer: (message: UserInput) => Promise<Receipt>
  followUp: (message: UserInput) => Promise<Receipt>
  resolve: (resume: Array<RunAgentResumeItem>) => Promise<Receipt>
  cancel: (operationId?: string) => Promise<Receipt>
  agents: ClientAgentHandles<THarness>
  /** Answer a question from a command or a plugin. */
  answer: (questionId: string, value: unknown) => Promise<Receipt>
  /** Run a plugin command. Its result arrives as a `harness.command.result` event. */
  command: (name: string, input?: unknown) => Promise<Receipt>
  /** Change a session setting. */
  setConfig: (key: string, value: unknown) => Promise<Receipt>
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
    if (!response.ok) {
      // A proxy can refuse a big upload with a page, not JSON.
      const refusal: unknown = await response.json().catch(() => undefined)
      throw failure('upload', response, refusal)
    }
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
        const reader = response.body.getReader()
        // Some fetch shims ignore the signal once the body streams.
        signal?.addEventListener('abort', () => void reader.cancel(), {
          once: true,
        })
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
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
      }),
    steer: (message) => send({ op: 'steer', message }),
    followUp: (message) => send({ op: 'followUp', message }),
    resolve: (resume) => send({ op: 'resolve', resume }),
    cancel: (operationId) =>
      send({ op: 'cancel', ...(operationId ? { operationId } : {}) }),
    agents,
    answer: (questionId, value) => send({ op: 'answer', questionId, value }),
    command: (name, input) => send({ op: 'command', name, input }),
    setConfig: (key, value) => send({ op: 'config', key, value }),
    events,
    snapshot: () => read('snapshot'),
    transcript: () => read('transcript'),
    describe: () => read('describe'),
    upload,
    mediaUrl,
    loadMedia,
  }
}
