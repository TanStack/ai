// Browser-safe: this module has type-only imports from the rest of the
// package, so no server code (adapters, stores, secrets) reaches a client.
import type { ModelMessage, RunAgentResumeItem } from '@tanstack/ai'
import type { AgentInputOf } from './agents'
import type { AnyHarness, HarnessAgentsOf } from './define'
import type { SessionDescription, SessionSnapshot } from './session'
import type {
  BusyPolicy,
  Cursor,
  HarnessInput,
  Receipt,
  SessionEvent,
  UserInput,
} from './types'

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

  const send = async (input: HarnessInput): Promise<Receipt> => {
    const response = await doFetch(`${base}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ threadId: options.threadId, input }),
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : response.statusText
      throw new Error(`Harness request failed (${response.status}): ${message}`)
    }
    // The handler answers /control with a Receipt.
    return body as Receipt
  }

  const read = async <T>(route: string) => {
    const query = new URLSearchParams({ threadId: options.threadId })
    const response = await doFetch(`${base}/${route}?${query}`, {
      headers: headers(),
    })
    if (!response.ok)
      throw new Error(`Harness ${route} failed (${response.status})`)
    // Each GET route answers with the type of the `HarnessClient` member
    // that reads it. That member type sets `T`.
    return (await response.json()) as T
  }

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
  }
}
