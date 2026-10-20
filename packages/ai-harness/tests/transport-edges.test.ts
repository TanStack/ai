import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  applyInput,
  capabilitiesOf,
  createHarnessHandler,
  handleHarnessSocket,
  parseControlFrame,
  parseHarnessInput,
} from '../src/server'
import { createHarnessClient } from '../src/client'
import {
  fakeSocket,
  gate,
  mockAdapter,
  readSse,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { PresenceEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
const user = { id: 'user-1' }
/** The upgrade request of a socket of `user`. */
const upgrade = new Request('http://x/api/harness/socket', { headers: auth })

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
  const host = createHarnessHost({
    persistence: memoryPersistence(),
    access: {
      getUser: ({ request }) =>
        request.headers.get('authorization') === 'Bearer good' ? user : null,
      // A user may use the threads whose id starts with the user id.
      rules: {
        isAllowed: ({ user, session }) => session.threadId.startsWith(user.id),
      },
    },
  })
  const handler = createHarnessHandler({ host, harness })
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
    const { host, harness, call } = setup()
    await host.open(harness, {
      threadId: 'someone-else',
      user: { id: 'someone' },
    })
    const statusOf = async (path: string, init?: RequestInit) =>
      (await call(path, init)).status

    expect(await statusOf('events')).toBe(400)
    expect(await statusOf('events?threadId=someone-else')).toBe(403)
    expect(await statusOf('snapshot')).toBe(400)
    expect(await statusOf('nowhere')).toBe(404)
    expect(await statusOf('run', { method: 'GET' })).toBe(400)

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
    await waitFor(async () =>
      expect((await snapshotOf()).status).toBe('requires_action'),
    )
    const [{ interrupt }] = (await snapshotOf()).pendingWaits

    // A thread with no stopped turn has nothing to resume.
    const nothing = await call('run', {
      method: 'POST',
      body: runBody('user-1-idle', {
        resume: [{ interruptId: 'nope', status: 'resolved', payload: true }],
      }),
    })
    expect(nothing.status).toBe(409)

    // Each AG-UI request has its own runId.
    const resumed = await call('run', {
      method: 'POST',
      body: runBody('user-1-resume', {
        runId: 'client-run-2',
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
    await waitFor(async () =>
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
  it('refuses a thread the user cannot access', async () => {
    const { host, harness } = setup()
    await host.open(harness, {
      threadId: 'user-2-x',
      user: { id: 'user-2' },
    })
    const { socket, sent, closed, receive } = fakeSocket()
    handleHarnessSocket({ host, harness, socket, request: upgrade })
    receive({ type: 'harness.subscribe', threadId: 'user-2-x' })
    await waitFor(() => expect(closed).toEqual([4403]))
    expect(sent).toEqual([
      {
        type: 'harness.error',
        message: 'forbidden',
        code: 'forbidden',
        requestId: expect.any(String),
      },
    ])
    await host.close()
  })

  it('reports a second subscribe and bad frames, and resumes from a cursor', async () => {
    const { host, harness } = setup([() => text('hello')])
    const first = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket: first.socket,
      request: upgrade,
    })
    first.receive({ type: 'harness.subscribe', threadId: 'user-1-ws2' })
    await waitFor(() =>
      expect(first.sent.some((frame) => frame.type === 'harness.hello')).toBe(
        true,
      ),
    )
    first.receive({ type: 'harness.subscribe', threadId: 'user-1-ws2' })
    await waitFor(() =>
      expect(first.sent.at(-1)).toEqual({
        type: 'harness.error',
        message: 'Already subscribed.',
        code: 'invalid_frame',
        requestId: expect.any(String),
      }),
    )
    first.receive('[1, 2]')
    await waitFor(() =>
      expect(first.sent.at(-1)).toMatchObject({ type: 'harness.error' }),
    )
    first.receive({
      type: 'harness.input',
      requestId: 'p1',
      input: { op: 'prompt', message: 'hi' },
    })
    await waitFor(() =>
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
      request: upgrade,
    })
    second.receive({
      type: 'harness.subscribe',
      threadId: 'user-1-ws2',
      from: cursor && 'cursor' in cursor ? cursor.cursor : undefined,
    })
    await waitFor(() =>
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

  it('takes an input sent right after the subscribe, before the hello', async () => {
    const { host, harness } = setup([() => text('hello')])
    const { socket, sent, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: upgrade,
    })
    receive({ type: 'harness.subscribe', threadId: 'user-1-ws3' })
    receive({
      type: 'harness.input',
      requestId: 'p1',
      input: { op: 'prompt', message: 'hi' },
    })
    await waitFor(() =>
      expect(
        sent.find((frame) => frame.type === 'harness.receipt'),
      ).toMatchObject({ requestId: 'p1', status: 'accepted' }),
    )
    expect(sent.some((frame) => frame.type === 'harness.error')).toBe(false)
    socket.close()
    await host.close()
  })

  it('closes the socket on a frame over media.maxBodyBytes, and runs nothing', async () => {
    const { host } = setup()
    const { adapter, calls } = mockAdapter([() => text('hello')])
    const harness = defineHarness({
      name: 'test/transport',
      adapter,
      media: { maxBodyBytes: 200 },
    })
    const { socket, sent, closed, receive } = fakeSocket()
    handleHarnessSocket({ host, harness, socket, request: upgrade })

    receive({ type: 'harness.subscribe', threadId: 'user-1-big' })
    await vi.waitFor(() =>
      expect(sent.some((frame) => frame.type === 'harness.hello')).toBe(true),
    )
    receive({
      type: 'harness.input',
      requestId: 'p1',
      input: { op: 'prompt', message: 'x'.repeat(300) },
    })

    // The frame is not parsed, so its error frame names the socket, not p1.
    expect(sent.at(-1)).toEqual({
      type: 'harness.error',
      message: 'The frame is bigger than the limit of 200 bytes.',
      code: 'invalid_frame',
      requestId: expect.any(String),
    })
    expect(sent.at(-1)).not.toMatchObject({ requestId: 'p1' })
    expect(closed).toEqual([1009])
    expect(sent.some((frame) => frame.type === 'harness.receipt')).toBe(false)
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('stops reading when the socket cannot send', async () => {
    const { host, harness } = setup()
    const { socket, receive } = fakeSocket({ failSend: true })
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: upgrade,
    })
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
    const session = await host.open(harness, {
      threadId: 'user-1-apply',
      user,
    })

    const first = await applyInput({
      harness,
      session,
      input: {
        op: 'prompt',
        message: 'slow',
      },
    })
    expect(first.status).toBe('accepted')
    const queued = await applyInput({
      harness,
      session,
      input: {
        op: 'prompt',
        message: 'next',
        busy: 'queue',
      },
    })
    expect(queued.status).toBe('queued')
    expect(
      await applyInput({
        harness,
        session,
        input: { op: 'steer', message: 'faster' },
      }),
    ).toHaveProperty('status')
    expect(
      await applyInput({
        harness,
        session,
        input: { op: 'followUp', message: 'after' },
      }),
    ).toHaveProperty('status')
    release.open()
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))

    expect(
      await applyInput({
        harness,
        session,
        input: { op: 'resolve', resume: [] },
      }),
    ).toMatchObject({ status: 'rejected' })
    expect(
      await applyInput({ harness, session, input: { op: 'cancel' } }),
    ).toHaveProperty('status')
    // defineHarness refuses this, but a hand-built harness object can name an
    // exposed agent that the session does not have.
    const loose = { ...harness, expose: { agents: ['pricer', 'ghost'] } }
    expect(
      await applyInput({
        harness: loose,
        session,
        input: { op: 'agent', agent: 'ghost' },
      }),
    ).toEqual({ inputId: '', status: 'rejected', reason: 'unknown_agent' })
    const detached = await applyInput({
      harness,
      session,
      input: {
        op: 'agent',
        agent: 'pricer',
        input: { vendor: 'acme' },
        detached: true,
      },
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
    expect((await client.send('hi', { busy: 'queue' })).status).toBe('accepted')
    await client.send('go on', { mode: 'steer' })
    await client.send('then', { mode: 'followUp' })
    expect((await client.resolve({ resume: [] })).status).toBe('rejected')
    await client.cancel()
    await client.cancel({ operationId: 'op-missing' })
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
    await expect(client.send('hi')).rejects.toThrow(
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
    const session = await host.open(harness, {
      threadId: 'user-1-cancel',
      user,
    })
    const operation = session.send('wait')
    await waitFor(() => expect(session.snapshot().status).toBe('running'))
    await applyInput({
      harness,
      session,
      input: {
        op: 'cancel',
        operationId: operation.id,
      },
    })
    await operation.then(
      () => undefined,
      () => undefined,
    )
    expect(operation.status()).toBe('cancelled')
    await host.close()
  })
})

describe('presence hooks', () => {
  /** A host whose presence hooks keep each call in `connected` and `left`. */
  function presenceSetup(
    hooks: { failConnect?: boolean; failDisconnect?: boolean } = {},
  ) {
    const connected: Array<PresenceEvent> = []
    const left: Array<PresenceEvent & { reason: string }> = []
    const harness = defineHarness({
      name: 'test/presence',
      adapter: mockAdapter([() => text('hi'), () => text('again')]).adapter,
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: ({ request }) =>
          request.headers.get('authorization') === 'Bearer good' ? user : null,
        rules: { isAllowed: () => true },
      },
      presence: {
        onConnect: (event) => {
          connected.push(event)
          if (hooks.failConnect) throw new Error('connect hook failed')
        },
        onDisconnect: async (event) => {
          left.push(event)
          if (hooks.failDisconnect) throw new Error('disconnect hook failed')
        },
      },
    })
    const handler = createHarnessHandler({ host, harness })
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
    const prompt = (threadId: string) =>
      call('control', {
        method: 'POST',
        body: JSON.stringify({
          threadId,
          input: { op: 'prompt', message: 'Hi.' },
        }),
      })
    return { host, harness, call, prompt, connected, left }
  }

  const isHello = (frame: { type?: string }) => frame.type === 'harness.hello'

  it('reports one connect and one disconnect for each SSE stream, with a new id for each tab', async () => {
    const { host, call, prompt, connected, left } = presenceSetup()
    await prompt('t-sse')
    await waitFor(async () =>
      expect(
        (await (await call('snapshot?threadId=t-sse')).json()).status,
      ).toBe('idle'),
    )
    expect(connected).toEqual([])

    const first = await call('events?threadId=t-sse')
    const second = await call('events?threadId=t-sse', {
      headers: { 'Last-Event-ID': '0' },
    })
    await readSse(first, isHello)
    await readSse(second, isHello)

    await waitFor(() => expect(left).toHaveLength(2))
    expect(connected).toEqual([
      {
        user,
        threadId: 't-sse',
        harness: 'test/presence',
        connectionId: expect.any(String),
        transport: 'sse',
        resumed: false,
      },
      expect.objectContaining({ transport: 'sse', resumed: true }),
    ])
    expect(connected[0]?.connectionId).not.toBe(connected[1]?.connectionId)
    expect(
      left.map(({ connectionId, reason }) => [connectionId, reason]),
    ).toEqual(connected.map(({ connectionId }) => [connectionId, 'closed']))
    await host.close()
  })

  it('reports revoked when a revoke closes an SSE stream', async () => {
    const { host, call, prompt, connected, left } = presenceSetup()
    await prompt('t-revoke')
    const reading = readSse(await call('events?threadId=t-revoke'), () => false)
    await waitFor(() => expect(connected).toHaveLength(1))

    host.revoke({ threadId: 't-revoke', user })
    await reading

    await waitFor(() =>
      expect(left).toEqual([expect.objectContaining({ reason: 'revoked' })]),
    )
    await host.close()
  })

  it('reports a socket after its subscribe, and closed, revoked, or error at its end', async () => {
    const { host, harness, prompt, connected, left } = presenceSetup()
    await prompt('t-ws')
    const open = (from?: string) => {
      const fake = fakeSocket()
      handleHarnessSocket({
        host,
        harness,
        socket: fake.socket,
        request: upgrade,
      })
      fake.receive({
        type: 'harness.subscribe',
        threadId: 't-ws',
        ...(from ? { from } : {}),
      })
      return fake
    }

    const closing = open()
    const failing = open('0')
    await waitFor(() => expect(connected).toHaveLength(2))
    expect(connected).toEqual([
      expect.objectContaining({
        transport: 'websocket',
        resumed: false,
        threadId: 't-ws',
      }),
      expect.objectContaining({ transport: 'websocket', resumed: true }),
    ])
    closing.socket.close()
    failing.fail()
    await waitFor(() => expect(left).toHaveLength(2))
    const revoking = open()
    await waitFor(() => expect(connected).toHaveLength(3))
    host.revoke({ threadId: 't-ws', user })

    await waitFor(() => expect(revoking.closed).toEqual([4403]))
    expect(
      left.map(({ connectionId, reason }) => [connectionId, reason]),
    ).toEqual([
      [connected[0]?.connectionId, 'closed'],
      [connected[1]?.connectionId, 'error'],
      [connected[2]?.connectionId, 'revoked'],
    ])
    await host.close()
  })

  it('reports error when a slow client makes the server close the stream', async () => {
    const { host, harness, prompt, connected, left } = presenceSetup()
    await prompt('t-slow')
    // One byte of queue and 50 ms: a client that does not read is slow.
    const stream = { sseQueueBytes: 1, slowConsumerMs: 50 }
    const handler = createHarnessHandler({ host, harness, stream })
    const response = await handler(
      new Request('http://x/api/harness/events?threadId=t-slow', {
        headers: auth,
      }),
    )
    const fake = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket: Object.assign(fake.socket, { bufferedAmount: 2 }),
      request: upgrade,
      stream: { socketBufferBytes: 1, slowConsumerMs: 50 },
    })
    fake.receive({ type: 'harness.subscribe', threadId: 't-slow' })

    await waitFor(() => expect(left).toHaveLength(2))
    expect(fake.closed).toEqual([4408])
    expect(
      left.map(({ transport, reason }) => [transport, reason]).sort(),
    ).toEqual([
      ['sse', 'error'],
      ['websocket', 'error'],
    ])
    expect(connected).toHaveLength(2)
    await response.body?.cancel()
    await host.close()
  })

  it('keeps the stream when a hook throws, and only warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host, call, prompt, connected, left } = presenceSetup({
      failConnect: true,
      failDisconnect: true,
    })
    await prompt('t-throw')

    const frames = await readSse<{ type?: string }>(
      await call('events?threadId=t-throw&from=0'),
      (frame) => frame.type === 'harness.event',
    )

    expect(frames.map((frame) => frame.type)).toEqual([
      'harness.hello',
      'harness.event',
    ])
    await waitFor(() => expect(left).toHaveLength(1))
    expect(connected).toHaveLength(1)
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('disconnect hook failed'),
      ),
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('connect hook failed'),
    )
    warn.mockRestore()
    await host.close()
  })

  it('does not report a POST run stream or a read from code', async () => {
    const { host, harness, call, connected } = presenceSetup()
    const run = await call('run', {
      method: 'POST',
      body: runBody('t-run', {
        messages: [{ id: 'u1', role: 'user', content: 'Hi.' }],
      }),
    })
    expect(await run.text()).toContain('RUN_FINISHED')
    const view = await host.observe(harness, {
      threadId: 't-run',
      user,
    })
    const controller = new AbortController()
    const events = view.events({ from: '0', signal: controller.signal })
    for await (const _ of events) break

    expect(connected).toEqual([])
    await host.close()
  })
})
