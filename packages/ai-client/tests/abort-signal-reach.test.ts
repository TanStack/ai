/**
 * A client cancel (`stop()`, the user's own `options.signal`, `disconnect()`)
 * must reach the work it should stop. The fake requests below hang until
 * their signal aborts, like a real fetch that keeps the run going.
 */
import { getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { RealtimeClient } from '../src/realtime-client'
import {
  fetchHttpStream,
  fetchJson,
  fetchServerSentEvents,
  rpcStream,
  stream,
  xhrHttpStream,
  xhrServerSentEvents,
} from '../src/connection-adapters'
import { createToolCallChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

const RUN_CONTEXT = { threadId: 'thread-1', runId: 'run-1' }

/** 'done' when `work` settles within `ms`, else 'hung'. */
function settlesWithin(work: Promise<unknown>, ms = 500) {
  return Promise.race([
    work.then(
      () => 'done',
      () => 'done',
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('hung'), ms)),
  ])
}

async function drain(iterable: AsyncIterable<unknown>) {
  for await (const _ of iterable) {
    // drain
  }
}

/** A fetch that hangs until its signal aborts (rejects at once without one). */
function hangingFetch() {
  const seen: { signal?: AbortSignal } = {}
  const fetchClient = ((_url: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? undefined
    seen.signal = signal
    if (!signal) {
      return Promise.reject(new Error('request sent without an abort signal'))
    }
    return new Promise<Response>((_, reject) => {
      const fail = () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      if (signal.aborted) fail()
      else signal.addEventListener('abort', fail, { once: true })
    })
  }) as typeof fetch
  return { fetchClient, aborted: () => seen.signal?.aborted === true }
}

/** An XHR whose response never comes; `abort()` ends it. */
function hangingXhr() {
  const xhr = {
    status: 0,
    statusText: '',
    responseText: '',
    withCredentials: false,
    onprogress: null as null | ((ev: unknown) => void),
    onload: null as null | ((ev: unknown) => void),
    onerror: null as null | ((ev: unknown) => void),
    onabort: null as null | ((ev: unknown) => void),
    onloadend: null as null | ((ev: unknown) => void),
    open: () => {},
    send: () => {},
    setRequestHeader: () => {},
    getResponseHeader: () => null,
    abort: vi.fn(() => {
      xhr.onabort?.({})
      xhr.onloadend?.({})
    }),
  }
  return {
    xhrFactory: () => xhr as unknown as XMLHttpRequest,
    aborted: () => xhr.abort.mock.calls.length > 0,
  }
}

describe("connection adapters follow the user's options.signal (L2)", () => {
  const cases = [
    ['fetchServerSentEvents', fetchServerSentEvents],
    ['fetchHttpStream', fetchHttpStream],
    ['fetchJson', fetchJson],
  ] as const
  for (const [name, factory] of cases) {
    for (const method of ['connect', 'joinRun'] as const) {
      it(`${name}.${method}`, async () => {
        const user = new AbortController()
        const client = new AbortController()
        const fake = hangingFetch()
        const adapter = factory('/api/chat', {
          fetchClient: fake.fetchClient,
          signal: user.signal,
        })
        const run = drain(
          method === 'connect'
            ? adapter.connect([], undefined, client.signal, RUN_CONTEXT)
            : adapter.joinRun!('run-1', client.signal),
        )
        setTimeout(() => user.abort(), 10)
        expect(await settlesWithin(run)).toBe('done')
        expect(fake.aborted()).toBe(true)
      })
    }
  }

  const xhrCases = [
    ['xhrServerSentEvents', xhrServerSentEvents],
    ['xhrHttpStream', xhrHttpStream],
  ] as const
  for (const [name, factory] of xhrCases) {
    for (const method of ['connect', 'joinRun'] as const) {
      it(`${name}.${method}`, async () => {
        const user = new AbortController()
        const client = new AbortController()
        const fake = hangingXhr()
        const adapter = factory('/api/chat', {
          xhrFactory: fake.xhrFactory,
          signal: user.signal,
        })
        const run = drain(
          method === 'connect'
            ? adapter.connect([], undefined, client.signal, RUN_CONTEXT)
            : adapter.joinRun!('run-1', client.signal),
        )
        setTimeout(() => user.abort(), 10)
        expect(await settlesWithin(run)).toBe('done')
        expect(fake.aborted()).toBe(true)
      })
    }
  }

  it('leaves no listener on a reused options.signal after each request', async () => {
    const user = new AbortController()
    const fetchClient = (() =>
      Promise.resolve(
        new Response('', { headers: { 'content-type': 'text/event-stream' } }),
      )) as typeof fetch
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      signal: user.signal,
    })
    for (let run = 0; run < 3; run++) {
      const client = new AbortController()
      await drain(adapter.connect([], undefined, client.signal, RUN_CONTEXT))
    }
    expect(getEventListeners(user.signal, 'abort')).toHaveLength(0)
  })
})

describe('stream() and rpcStream() stop on abort (L3)', () => {
  // A source that ignores its signal and never ends.
  const ignoresSignal = () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      await new Promise(() => {})
    })()

  for (const [name, adapter] of [
    ['stream', stream(ignoresSignal)],
    ['rpcStream', rpcStream(ignoresSignal)],
  ] as const) {
    it(name, async () => {
      const client = new AbortController()
      const run = drain(
        adapter.connect([], undefined, client.signal, RUN_CONTEXT),
      )
      setTimeout(() => client.abort(), 10)
      expect(await settlesWithin(run)).toBe('done')
    })
  }
})

describe('ChatClient.stop() (L1)', () => {
  // 'stop' starts the tool while chunks stream. 'tool_calls' starts it in
  // finalizeStream(), after the stream ends.
  it.each(['stop', 'tool_calls'] as const)(
    'does not wait for a client tool that never ends (finishReason %s)',
    async (finishReason) => {
      let toolStarted = false
      const chunks = createToolCallChunks([
        { id: 'tc-1', name: 'stuck', arguments: '{}' },
      ])
      chunks[chunks.length - 1] = {
        ...chunks[chunks.length - 1]!,
        finishReason,
      } as StreamChunk
      const connection: ConnectConnectionAdapter = {
        async *connect(_messages, _data, abortSignal) {
          for (const chunk of chunks) {
            if (abortSignal?.aborted) return
            yield chunk
          }
        },
      }
      const client = new ChatClient({
        threadId: 'thread-1',
        connection,
        tools: [
          {
            __toolSide: 'client' as const,
            name: 'stuck',
            description: 'Never finishes',
            execute: () => {
              toolStarted = true
              return new Promise(() => {})
            },
          },
        ],
      })
      const send = client.sendMessage('Go')
      await vi.waitFor(() => expect(toolStarted).toBe(true))
      client.stop()
      expect(await settlesWithin(send)).toBe('done')
    },
  )
})

describe('RealtimeClient.disconnect() during connect() (L4)', () => {
  // `gate` is the connect() step that waits while disconnect() runs.
  for (const gate of ['getToken', 'adapter.connect', 'startAudioCapture']) {
    it(`stays disconnected when disconnect() runs during ${gate}`, async () => {
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const wait = (step: string) => (step === gate ? held : undefined)
      const connection = {
        on: () => () => {},
        updateSession: () => {},
        disconnect: vi.fn(async () => {}),
        startAudioCapture: async () => {
          await wait('startAudioCapture')
        },
      }
      const adapterConnect = vi.fn(async () => {
        await wait('adapter.connect')
        return connection
      })
      const client = new RealtimeClient({
        getToken: async () => {
          await wait('getToken')
          return { token: 't', expiresAt: Date.now() + 60_000 } as any
        },
        adapter: { connect: adapterConnect } as any,
      })

      const connecting = client.connect()
      await vi.waitFor(() => expect(client.status).toBe('connecting'))
      await new Promise((resolve) => setTimeout(resolve, 0))
      await client.disconnect()
      release()
      await connecting.catch(() => {})

      const opened = adapterConnect.mock.calls.length > 0
      // Either it never connects, or it closes what it opened.
      expect(!opened || connection.disconnect.mock.calls.length > 0).toBe(true)
      expect(client.status).toBe('idle')
      // No token refresh is armed for a session that does not exist.
      expect(Reflect.get(client, 'tokenRefreshTimeout')).toBeNull()
    })
  }

  it('closes a connection that a second connect() replaced during audio startup', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const makeConnection = (startAudioCapture: () => Promise<void>) => ({
      on: () => () => {},
      updateSession: () => {},
      disconnect: vi.fn(async () => {}),
      startAudioCapture,
    })
    const first = makeConnection(() => held)
    const second = makeConnection(async () => {})
    const adapterConnect = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    const client = new RealtimeClient({
      getToken: async () =>
        ({ token: 't', expiresAt: Date.now() + 60_000 }) as any,
      adapter: { connect: adapterConnect } as any,
      autoCapture: true,
    })

    const firstConnect = client.connect()
    await vi.waitFor(() => expect(adapterConnect).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await client.connect()
    release()
    await firstConnect

    expect(first.disconnect).toHaveBeenCalled()
    expect(second.disconnect).not.toHaveBeenCalled()
    await client.disconnect()
  })
})

describe('RealtimeClient.disconnect() during a token refresh', () => {
  it('does not re-arm the refresh timer', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    // First token expires now, so the refresh starts at once and then waits.
    const getToken = vi
      .fn()
      .mockResolvedValueOnce({ token: 't1', expiresAt: Date.now() })
      .mockImplementationOnce(async () => {
        await held
        return { token: 't2', expiresAt: Date.now() }
      })
    const client = new RealtimeClient({
      getToken,
      adapter: {
        connect: async () => ({
          on: () => () => {},
          updateSession: () => {},
          disconnect: async () => {},
          startAudioCapture: async () => {},
        }),
      } as any,
    })

    await client.connect()
    await vi.waitFor(() => expect(getToken).toHaveBeenCalledTimes(2))
    await client.disconnect()
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(Reflect.get(client, 'tokenRefreshTimeout')).toBeNull()
  })
})
