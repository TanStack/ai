import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, encodeWsFrame } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createHarnessClient } from '../src/client'
import { createHarnessHandler, handleHarnessSocket } from '../src/server'
import { HEARTBEAT_MS } from '../src/sse'
import { runHarnessWorker } from '../src/worker'
import { after, fakeSocket, gate, mockAdapter, readSse, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src/types'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const BASE = 'http://x/api/harness'

/**
 * One model call that answers `content`, with usage. The log keeps the
 * TanStack `usage` object of `RUN_FINISHED`. The wire sends the AG-UI
 * `usage` array.
 */
const lossyText = (content: string) =>
  text(content).map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        }
      : chunk,
  )

/** The AG-UI wire form of a logged chunk (`toWireChunk`). */
const wireOf = (event: StreamChunk): unknown =>
  JSON.parse(encodeWsFrame(event, undefined))

const isFinished = (event: { type: string; name?: string }) =>
  event.type === EventType.CUSTOM && event.name === 'harness.operation.finished'

/** Frames until the first `harness.operation.finished` event. */
const isTurnEnd = (frame: any) =>
  frame.type === 'harness.event' && isFinished(frame.event)

/** The logged entries of `events`, until the turn ends. */
async function logged(events: AsyncIterable<SessionEvent>) {
  const entries: Array<SessionEvent> = []
  for await (const entry of events) {
    entries.push(entry)
    if (isFinished(entry.event)) break
  }
  return entries
}

/**
 * Each event frame has the wire form of the logged chunk at its cursor. At
 * least one logged chunk has keys that the wire drops, so an internal chunk
 * on the wire fails this check.
 */
function expectWireFrames(
  frames: ReadonlyArray<any>,
  entries: ReadonlyArray<SessionEvent>,
) {
  const events = frames.filter((frame) => frame.type === 'harness.event')
  expect(events.map((frame) => frame.cursor)).toEqual(
    entries.map((entry) => entry.cursor),
  )
  events.forEach((frame, index) => {
    expect(frame.event).toEqual(wireOf(entries[index]!.event))
  })
  const isLossy = entries.some(
    (entry) =>
      JSON.stringify(wireOf(entry.event)) !== JSON.stringify(entry.event),
  )
  expect(isLossy).toBe(true)
}

function setup() {
  const { adapter } = mockAdapter([() => lossyText('hello')])
  const harness = defineHarness({ name: 'test/transport-wire', adapter })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const handler = createHarnessHandler({ host, harness, openAccess: true })
  return { host, harness, handler }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('every transport sends AG-UI wire chunks', () => {
  it('GET events starts with hello, then sends the wire form of each logged chunk', async () => {
    const { host, harness, handler } = setup()
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')

    const frames = await readSse<any>(
      await handler(new Request(`${BASE}/events?threadId=t1&v=2`)),
      isTurnEnd,
    )

    expect(frames[0]).toEqual({ type: 'harness.hello', v: 2, threadId: 't1' })
    expectWireFrames(frames, await logged(session.events()))
    await session.close()
    await host.close()
  })

  it('the socket sends the wire form of each logged chunk', async () => {
    const { host, harness } = setup()
    const { socket, sent, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: new Request(`${BASE}/socket`),
      openAccess: true,
    })

    receive({ type: 'harness.subscribe', threadId: 't2', v: 2 })
    receive({
      type: 'harness.input',
      requestId: 'r1',
      input: { op: 'prompt', message: 'hi' },
    })
    await waitFor(() => expect(sent.some(isTurnEnd)).toBe(true), {
      timeout: 5000,
    })

    expect(sent[0]).toEqual({ type: 'harness.hello', v: 2, threadId: 't2' })
    const view = await host.observe(harness, { threadId: 't2' })
    expectWireFrames(sent, await logged(view.events()))
    socket.close()
    await host.close()
  })

  it('the stdio worker sends the wire form of each logged chunk', async () => {
    const { adapter } = mockAdapter([() => lossyText('hello')])
    const harness = defineHarness({ name: 'test/transport-wire', adapter })
    const persistence = memoryPersistence()
    const input = new PassThrough()
    const frames: Array<any> = []
    const running = runHarnessWorker(harness, {
      input,
      output: { write: (line: string) => frames.push(JSON.parse(line)) },
      persistence,
    })
    const send = (frame: unknown) => input.write(`${JSON.stringify(frame)}\n`)

    send({ type: 'harness.subscribe', threadId: 't3', v: 2 })
    send({
      type: 'harness.input',
      requestId: 'r1',
      input: { op: 'prompt', message: 'hi' },
    })
    await waitFor(() => expect(frames.some(isTurnEnd)).toBe(true), {
      timeout: 5000,
    })
    input.end()
    await running

    // A second host reads the log that the worker wrote.
    const reader = createHarnessHost({ persistence })
    const view = await reader.observe(harness, { threadId: 't3' })
    expectWireFrames(frames, await logged(view.events()))
    await reader.close()
  })
})

describe('request ids, versions, and heartbeats', () => {
  it('sends back a safe X-Request-Id, and makes a new one for an unsafe value', async () => {
    const { host, handler } = setup()

    const safe = await handler(
      new Request(`${BASE}/capabilities`, {
        headers: { 'X-Request-Id': 'req-1.a:b_c' },
      }),
    )
    const unsafe = await handler(
      new Request(`${BASE}/capabilities`, {
        headers: { 'X-Request-Id': 'bad id\twith space' },
      }),
    )
    const none = await handler(new Request(`${BASE}/sessions`))

    expect(safe.headers.get('X-Request-Id')).toBe('req-1.a:b_c')
    expect(unsafe.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(none.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/)
    await host.close()
  })

  it('answers an unsupported ?v= with one error frame that names the request', async () => {
    const { host, harness, handler } = setup()
    await (await host.open(harness, { threadId: 't4' })).close()

    const frames = await readSse<any>(
      await handler(
        new Request(`${BASE}/events?threadId=t4&v=9`, {
          headers: { 'X-Request-Id': 'req-9' },
        }),
      ),
      () => false,
    )
    const hostFrames = await readSse<any>(
      await handler(new Request(`${BASE}/host-events?v=9`)),
      () => false,
    )

    const refused = {
      type: 'harness.error',
      message:
        'Protocol version 9 is not supported. This host speaks version 2.',
      code: 'unsupported_version',
    }
    expect(frames).toEqual([{ ...refused, requestId: 'req-9' }])
    expect(hostFrames).toEqual([{ ...refused, requestId: expect.any(String) }])
    await host.close()
  })

  it('the socket refuses an unsupported v and closes, and names the request of a bad frame', async () => {
    const { host, harness } = setup()
    const bad = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket: bad.socket,
      request: new Request(`${BASE}/socket`, {
        headers: { 'X-Request-Id': 'up-1' },
      }),
      openAccess: true,
    })
    bad.receive({ type: 'harness.input', requestId: 'r9', input: {} })
    await waitFor(
      () =>
        expect(bad.sent.at(-1)).toMatchObject({
          type: 'harness.error',
          code: 'invalid_frame',
          requestId: 'r9',
        }),
      { timeout: 5000 },
    )

    bad.receive({ type: 'harness.subscribe', threadId: 't5', v: 1 })
    await waitFor(() => expect(bad.closed).toEqual([4400]), {
      timeout: 5000,
    })
    expect(bad.sent.at(-1)).toEqual({
      type: 'harness.error',
      message:
        'Protocol version 1 is not supported. This host speaks version 2.',
      code: 'unsupported_version',
      // The subscribe has no requestId, so the id of the upgrade request.
      requestId: 'up-1',
    })
    await host.close()
  })

  it('host-events starts with hello, and the client skips it', async () => {
    const { host, harness, handler } = setup()
    const frames = readSse<any>(
      await handler(new Request(`${BASE}/host-events`)),
      (frame) => frame.type !== 'harness.hello',
    )
    const client = createHarnessClient({
      url: BASE,
      threadId: 't6',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    const reading = new AbortController()
    const first = (async () => {
      for await (const event of client.hostEvents({ signal: reading.signal }))
        return event
      return undefined
    })()

    const session = await host.open(harness, { threadId: 't6' })
    await session.send('hi')

    expect((await frames)[0]).toEqual({ type: 'harness.hello', v: 2 })
    // The first frame that the client gives is a host event.
    expect((await first)?.type).not.toMatch(/^harness./)
    reading.abort()
    await session.close()
    await host.close()
  })

  it.each([
    ['the default', HEARTBEAT_MS, undefined],
    ['stream.heartbeatMs', 1000, { heartbeatMs: 1000 }],
  ])(
    'POST run gets a ping comment while the turn is quiet, after %s',
    async (_name, wait, stream) => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      const release = gate()
      const { adapter } = mockAdapter([after(release.opened, 'late')])
      const harness = defineHarness({ name: 'test/transport-wire', adapter })
      const host = createHarnessHost({ persistence: memoryPersistence() })
      const handler = createHarnessHandler({
        host,
        harness,
        openAccess: true,
        ...(stream ? { stream } : {}),
      })

      const response = await handler(
        new Request(`${BASE}/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            threadId: 't7',
            runId: 'run-7',
            messages: [{ id: 'u1', role: 'user', content: 'hi' }],
            tools: [],
            context: [],
            state: {},
            forwardedProps: {},
          }),
        }),
      )
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let body = ''
      // Read the first event, then wait in a quiet turn.
      while (!body.includes('data: ')) {
        body += decoder.decode((await reader.read()).value)
      }
      vi.advanceTimersByTime(wait)
      body += decoder.decode((await reader.read()).value)

      expect(body).toContain(': ping\n\n')
      release.open()
      await reader.cancel()
      await host.close()
    },
  )

  it('the socket sends a ping after stream.heartbeatMs', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { host, harness } = setup()
    const { socket, sent } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: new Request(`${BASE}/socket`),
      openAccess: true,
      stream: { heartbeatMs: 1000 },
    })
    vi.advanceTimersByTime(1000)
    expect(sent).toEqual([{ type: 'harness.ping' }])
    socket.close()
    await host.close()
  })

  it('the handler and the socket throw at the start for a bad stream value', async () => {
    const { host, harness } = setup()
    expect(() =>
      createHarnessHandler({
        host,
        harness,
        openAccess: true,
        stream: { heartbeatMs: 0 },
      }),
    ).toThrow(
      'createHarnessHandler needs a stream.heartbeatMs that is a finite number above 0.',
    )
    expect(() =>
      handleHarnessSocket({
        host,
        harness,
        socket: fakeSocket().socket,
        request: new Request(`${BASE}/socket`),
        openAccess: true,
        stream: { socketBufferBytes: Number.NaN },
      }),
    ).toThrow(
      'handleHarnessSocket needs a stream.socketBufferBytes that is a finite number above 0.',
    )
    await host.close()
  })
})
