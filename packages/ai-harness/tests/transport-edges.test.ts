import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  applyInput,
  capabilitiesOf,
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  handleHarnessSocket,
  parseControlFrame,
  parseHarnessInput,
} from '../src'
import { createHarnessClient } from '../src/client'
import { gate, mockAdapter, text, toolCall, untilAborted } from './helpers'
import type { WebSocketLike } from '@tanstack/ai'
import type { HostFrame } from '../src'

const pricer = defineAgent({
  name: 'pricer',
  description: 'Prices a vendor',
  produces: 'data',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => ({ cents: ctx.input.vendor.length }),
})
const lookup = toolDefinition({
  name: 'lookup',
  description: 'Look up a fact',
  inputSchema: z.object({ q: z.string() }),
}).server(async () => 'found')
const remove = toolDefinition({
  name: 'remove',
  description: 'Remove a file',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
}).server(async () => ({ removed: true }))

const auth = { authorization: 'Bearer good' }

function setup(replies: Parameters<typeof mockAdapter>[0] = []) {
  const { adapter, calls } = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/transport',
    adapter,
    tools: [lookup, remove],
    agents: [pricer],
    subagents: { agents: [pricer] },
    expose: { agents: ['pricer'] },
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const handler = createHarnessHandler({
    host,
    harness,
    authorize: (request) =>
      request.headers.get('authorization') === 'Bearer good'
        ? { id: 'user-1' }
        : null,
    canAccess: (principal, threadId) => threadId.startsWith(principal.id),
  })
  const call = (path: string, init: RequestInit = {}) =>
    handler(
      new Request(`http://x/api/harness/${path}`, {
        ...init,
        headers: {
          ...auth,
          'content-type': 'application/json',
          ...init.headers,
        },
      }),
    )
  return { handler, host, harness, calls, call }
}

const runBody = (threadId: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    threadId,
    runId: 'client-run',
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...extra,
  })

describe('HTTP handler edges', () => {
  it('answers bad requests with 400, 403, and 404', async () => {
    const { host, call } = setup()
    const statusOf = async (path: string, init?: RequestInit) =>
      (await call(path, init)).status

    expect(await statusOf('events')).toBe(400)
    expect(await statusOf('events?threadId=someone-else')).toBe(403)
    expect(await statusOf('snapshot')).toBe(400)
    expect(await statusOf('nowhere')).toBe(404)
    expect(await statusOf('run', { method: 'GET' })).toBe(404)

    const control = (body: string) =>
      statusOf('control', { method: 'POST', body })
    expect(await control('null')).toBe(400)
    expect(await control('{"input":{}}')).toBe(400)
    expect(await control('{"threadId":7}')).toBe(400)
    expect(await control('{"threadId":"user-1-a"}')).toBe(400)
    expect(await control('not json')).toBe(400)
    expect(
      await control(
        '{"threadId":"someone-else","input":{"op":"prompt","message":"hi"}}',
      ),
    ).toBe(403)

    expect(
      await statusOf('run', { method: 'POST', body: runBody('someone-else') }),
    ).toBe(403)
    const noMessage = await call('run', {
      method: 'POST',
      body: runBody('user-1-r', {
        messages: [{ id: 'a', role: 'assistant', content: 'hello' }],
      }),
    })
    expect(noMessage.status).toBe(400)
    expect(await noMessage.json()).toEqual({ error: 'no user message' })
    await host.close()
  })

  it('reads the prompt from AG-UI content parts', async () => {
    const { host, call, calls } = setup([() => text('from parts')])
    const response = await call('run', {
      method: 'POST',
      body: runBody('user-1-parts', {
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: [
              { type: 'text', text: 'part one, ' },
              { type: 'binary', mimeType: 'image/png', data: 'AA==' },
              { type: 'text', text: 'part two' },
            ],
          },
        ],
      }),
    })
    expect(await response.text()).toContain('from parts')
    expect(JSON.stringify(calls[0].messages)).toContain('part one, part two')
    await host.close()
  })

  it('continues an interrupted turn when a run request carries resume', async () => {
    const { host, call } = setup([
      () => toolCall('remove', { path: 'a.txt' }),
      () => text('removed it'),
    ])
    const control = await call('control', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'user-1-resume',
        input: { op: 'prompt', message: 'remove a.txt' },
      }),
    })
    expect((await control.json()).status).toBe('accepted')
    const snapshotOf = async () =>
      (await call('snapshot?threadId=user-1-resume')).json()
    await vi.waitFor(async () =>
      expect((await snapshotOf()).status).toBe('requires_action'),
    )
    const [interrupt] = (await snapshotOf()).pendingInterrupts

    // A thread with no stopped turn has nothing to resume.
    const nothing = await call('run', {
      method: 'POST',
      body: runBody('user-1-idle', {
        resume: [{ interruptId: 'nope', status: 'resolved', payload: true }],
      }),
    })
    expect(nothing.status).toBe(409)

    const resumed = await call('run', {
      method: 'POST',
      body: runBody('user-1-resume', {
        resume: [
          { interruptId: interrupt.id, status: 'resolved', payload: true },
        ],
      }),
    })
    expect(resumed.headers.get('content-type')).toContain('text/event-stream')
    const body = await resumed.text()
    expect(body).toContain('removed it')
    expect(body).toContain('harness.operation.finished')
    await host.close()
  })

  it('streams session events from a `from` query cursor', async () => {
    const { host, call } = setup([() => text('one'), () => text('two')])
    const prompt = (message: string) =>
      call('control', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'user-1-from',
          input: { op: 'prompt', message },
        }),
      })
    await prompt('first')
    await vi.waitFor(async () =>
      expect(
        (await (await call('snapshot?threadId=user-1-from')).json()).status,
      ).toBe('idle'),
    )
    const snapshot = await (await call('snapshot?threadId=user-1-from')).json()
    await prompt('second')
    const response = await call(
      `events?threadId=user-1-from&from=${snapshot.cursor}`,
    )
    const reader = response.body!.getReader()
    let seen = ''
    while (!seen.includes('harness.operation.finished')) {
      const { value, done } = await reader.read()
      if (done) break
      seen += new TextDecoder().decode(value)
    }
    await reader.cancel()
    expect(seen).toContain('two')
    expect(seen).not.toContain('"delta":"one"')
    await host.close()
  })
})

describe('WebSocket edges', () => {
  function fakeSocket(options: { failSend?: boolean } = {}) {
    const handlers: Record<string, Array<(event?: any) => void>> = {}
    const sent: Array<HostFrame> = []
    const closed: Array<number | undefined> = []
    const socket: WebSocketLike = {
      send: (data) => {
        if (options.failSend) throw new Error('socket gone')
        sent.push(JSON.parse(data))
      },
      close: (code?: number) => {
        closed.push(code)
        handlers.close?.forEach((handler) => handler())
      },
      addEventListener: (type: string, handler: (event?: any) => void) => {
        ;(handlers[type] ??= []).push(handler)
      },
    }
    const receive = (frame: unknown) =>
      handlers.message?.forEach((handler) =>
        handler({
          data: typeof frame === 'string' ? frame : JSON.stringify(frame),
        }),
      )
    const fail = () => handlers.error?.forEach((handler) => handler())
    return { socket, sent, closed, receive, fail }
  }

  it('refuses a thread the principal cannot access', async () => {
    const { host, harness } = setup()
    const { socket, sent, closed, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      principal: { id: 'user-1' },
      canAccess: () => false,
    })
    receive({ type: 'harness.subscribe', threadId: 'user-1-x' })
    await vi.waitFor(() => expect(closed).toEqual([4403]))
    expect(sent).toEqual([{ type: 'harness.error', message: 'forbidden' }])
    await host.close()
  })

  it('reports a second subscribe and bad frames, and resumes from a cursor', async () => {
    const { host, harness } = setup([() => text('hello')])
    const first = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket: first.socket,
      principal: { id: 'user-1' },
    })
    first.receive({ type: 'harness.subscribe', threadId: 'user-1-ws2' })
    await vi.waitFor(() =>
      expect(first.sent.some((frame) => frame.type === 'harness.hello')).toBe(
        true,
      ),
    )
    first.receive({ type: 'harness.subscribe', threadId: 'user-1-ws2' })
    await vi.waitFor(() =>
      expect(first.sent.at(-1)).toEqual({
        type: 'harness.error',
        message: 'Already subscribed.',
      }),
    )
    first.receive('[1, 2]')
    await vi.waitFor(() =>
      expect(first.sent.at(-1)).toMatchObject({ type: 'harness.error' }),
    )
    first.receive({
      type: 'harness.input',
      requestId: 'p1',
      input: { op: 'prompt', message: 'hi' },
    })
    await vi.waitFor(() =>
      expect(
        first.sent.some(
          (frame) =>
            frame.type === 'harness.event' &&
            frame.event.type === 'CUSTOM' &&
            frame.event.name === 'harness.operation.finished',
        ),
      ).toBe(true),
    )
    const cursor = first.sent
      .filter((frame) => frame.type === 'harness.event')
      .at(-1)
    first.fail()

    // A new socket that resumes after the last cursor sees nothing old.
    const second = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket: second.socket,
      principal: { id: 'user-1' },
    })
    second.receive({
      type: 'harness.subscribe',
      threadId: 'user-1-ws2',
      from: cursor && 'cursor' in cursor ? cursor.cursor : undefined,
    })
    await vi.waitFor(() =>
      expect(second.sent.some((frame) => frame.type === 'harness.hello')).toBe(
        true,
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(
      second.sent.filter((frame) => frame.type === 'harness.event'),
    ).toEqual([])
    second.socket.close()
    await host.close()
  })

  it('stops reading when the socket cannot send', async () => {
    const { host, harness } = setup()
    const { socket, receive } = fakeSocket({ failSend: true })
    handleHarnessSocket({ host, harness, socket, principal: { id: 'user-1' } })
    receive({ type: 'harness.subscribe', threadId: 'user-1-dead' })
    // Nothing to assert on the socket: the send failure must not throw.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await host.close()
  })
})

describe('protocol parsing and inputs', () => {
  it('checks each input op for its fields', () => {
    expect(() => parseHarnessInput(null)).toThrow('known op')
    expect(() => parseHarnessInput({ op: 'launch' })).toThrow('known op')
    expect(() => parseHarnessInput({ op: 'steer' })).toThrow(
      'steer needs a message',
    )
    expect(() => parseHarnessInput({ op: 'resolve' })).toThrow(
      'resolve needs a resume array',
    )
    expect(() => parseHarnessInput({ op: 'agent' })).toThrow(
      'agent needs an agent name',
    )
    expect(
      parseHarnessInput({
        op: 'followUp',
        message: [{ type: 'text', content: 'x' }],
      }),
    ).toMatchObject({ op: 'followUp' })
    expect(parseHarnessInput({ op: 'cancel' })).toEqual({ op: 'cancel' })
  })

  it('parses subscribe frames with a cursor and refuses non-objects', () => {
    expect(
      parseControlFrame(
        '{"type":"harness.subscribe","threadId":"t","from":"4"}',
      ),
    ).toEqual({ type: 'harness.subscribe', threadId: 't', from: '4' })
    expect(
      parseControlFrame('{"type":"harness.subscribe","threadId":"t","from":4}'),
    ).toEqual({ type: 'harness.subscribe', threadId: 't' })
    expect(() => parseControlFrame('7')).toThrow('Invalid frame.')
    expect(() => parseControlFrame('null')).toThrow('Invalid frame.')
  })

  it('applies steer, follow-up, resolve, cancel, busy prompts, and agents', async () => {
    const release = gate()
    const { host, harness } = setup([
      () =>
        (async function* () {
          await release.opened
          yield* text('slow answer')
        })(),
      () => text('queued answer'),
      () => text('follow-up answer'),
    ])
    const session = await host.open(harness, { threadId: 'user-1-apply' })

    const first = await applyInput(harness, session, {
      op: 'prompt',
      message: 'slow',
    })
    expect(first.status).toBe('accepted')
    const queued = await applyInput(harness, session, {
      op: 'prompt',
      message: 'next',
      busy: 'queue',
    })
    expect(queued.status).toBe('queued')
    expect(
      await applyInput(harness, session, { op: 'steer', message: 'faster' }),
    ).toHaveProperty('status')
    expect(
      await applyInput(harness, session, { op: 'followUp', message: 'after' }),
    ).toHaveProperty('status')
    release.open()
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))

    expect(
      await applyInput(harness, session, { op: 'resolve', resume: [] }),
    ).toMatchObject({ status: 'rejected' })
    expect(await applyInput(harness, session, { op: 'cancel' })).toHaveProperty(
      'status',
    )
    // defineHarness refuses this, but a hand-built harness object can name an
    // exposed agent that the session does not have.
    const loose = { ...harness, expose: { agents: ['pricer', 'ghost'] } }
    expect(
      await applyInput(loose, session, { op: 'agent', agent: 'ghost' }),
    ).toEqual({ inputId: '', status: 'rejected', reason: 'unknown_agent' })
    const detached = await applyInput(harness, session, {
      op: 'agent',
      agent: 'pricer',
      input: { vendor: 'acme' },
      detached: true,
    })
    expect(detached).toMatchObject({ status: 'accepted' })
    await session.operation(detached.operationId ?? '')
    await host.close()
  })

  it('describes tools, subagents, and what exposed agents produce', () => {
    const { harness } = setup()
    const capabilities = capabilitiesOf(harness)
    expect(capabilities.tools.items.map((tool) => tool.name)).toEqual([
      'lookup',
      'remove',
    ])
    expect(capabilities.multiAgent).toMatchObject({
      supported: true,
      subagents: [{ name: 'pricer', description: 'Prices a vendor' }],
    })
    expect(capabilities.custom.tanstack.agents[0]).toMatchObject({
      name: 'pricer',
      produces: 'data',
    })
    const bare = capabilitiesOf(
      defineHarness({ name: 'test/bare', adapter: mockAdapter([]).adapter }),
    )
    expect(bare.multiAgent.supported).toBe(false)
    expect(bare.tools.items).toEqual([])
  })
})

describe('createHarnessClient edges', () => {
  it('sends every input op with headers from a function', async () => {
    const { host, harness, handler } = setup([
      () => text('a'),
      () => text('b'),
      () => text('c'),
    ])
    const seenAuth: Array<string | null> = []
    const client = createHarnessClient<typeof harness>({
      url: 'http://x/api/harness',
      threadId: 'user-1-client',
      headers: () => auth,
      fetch: (input, init) => {
        const request = new Request(input, init)
        seenAuth.push(request.headers.get('authorization'))
        return handler(request)
      },
    })
    expect((await client.prompt('hi', { busy: 'queue' })).status).toBe(
      'accepted',
    )
    await client.steer('go on')
    await client.followUp('then')
    expect((await client.resolve([])).status).toBe('rejected')
    await client.cancel()
    await client.cancel('op-missing')
    expect(
      (await client.agents.pricer.start({ vendor: 'x' }, { detached: true }))
        .status,
    ).toBe('accepted')
    expect(seenAuth.every((value) => value === 'Bearer good')).toBe(true)
    // Symbol keys on the agents proxy are not agents.
    expect(
      (client.agents as unknown as Record<symbol, unknown>)[Symbol.iterator],
    ).toBeUndefined()
    await host.close()
  })

  it('reports errors from the handler and a failed snapshot', async () => {
    const client = createHarnessClient({
      url: 'http://x/api/harness/',
      threadId: 't',
      fetch: async (input) =>
        String(input).includes('snapshot')
          ? new Response('nope', { status: 500 })
          : new Response('"plain"', { status: 502, statusText: 'Bad Gateway' }),
    })
    await expect(client.prompt('hi')).rejects.toThrow(
      'Harness request failed (502): Bad Gateway',
    )
    await expect(client.snapshot()).rejects.toThrow(
      'Harness snapshot failed (500)',
    )
  })

  it('reconnects after a failed events request and resumes from the cursor', async () => {
    const urls: Array<string> = []
    const frame = (cursor: string) =>
      `id: ${cursor}\ndata: ${JSON.stringify({
        type: 'harness.event',
        cursor,
        operationId: 'op',
        event: { type: 'CUSTOM', name: 'tick', value: cursor, timestamp: 1 },
      })}\n\n`
    let calls = 0
    const client = createHarnessClient({
      url: 'http://x/api/harness',
      threadId: 't',
      reconnectDelayMs: 1,
      fetch: async (input) => {
        urls.push(String(input))
        calls += 1
        if (calls === 1) return new Response('down', { status: 503 })
        if (calls === 2) throw new Error('network')
        const body = calls === 3 ? `: comment\n\n${frame('1')}` : frame('2')
        return new Response(body, { status: 200 })
      },
    })
    const controller = new AbortController()
    const seen: Array<string> = []
    for await (const entry of client.events({
      from: '0',
      signal: controller.signal,
    })) {
      seen.push(entry.cursor)
      if (seen.length === 2) controller.abort()
    }
    expect(seen).toEqual(['1', '2'])
    expect(urls[0]).toContain('from=0')
    expect(urls.at(-1)).toContain('from=1')
  })

  it('stops quietly when aborted during a request', async () => {
    const controller = new AbortController()
    const client = createHarnessClient({
      url: 'http://x/api/harness',
      threadId: 't',
      fetch: async () => {
        controller.abort()
        throw new Error('aborted')
      },
    })
    const seen: Array<unknown> = []
    for await (const entry of client.events({ signal: controller.signal })) {
      seen.push(entry)
    }
    expect(seen).toEqual([])
  })
})

describe('an operation that waits for cancel', () => {
  it('cancels through a control input', async () => {
    const { host, harness } = setup([untilAborted()])
    const session = await host.open(harness, { threadId: 'user-1-cancel' })
    const operation = session.prompt('wait')
    await vi.waitFor(() => expect(session.snapshot().status).toBe('running'))
    await applyInput(harness, session, {
      op: 'cancel',
      operationId: operation.id,
    })
    await operation.then(
      () => undefined,
      () => undefined,
    )
    expect(operation.status()).toBe('cancelled')
    await host.close()
  })
})
