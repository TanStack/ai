import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import {
  applyInput,
  createHarnessHandler,
  handleHarnessSocket,
  parseControlFrame,
  parseHarnessInput,
} from '../src/server'
import {
  after,
  fakeSocket,
  gate,
  mockAdapter,
  readSse,
  text,
  wakeMessages,
} from './helpers'
import {
  HARNESS_PROTOCOL_VERSION,
  requestIdOf,
  versionError,
} from '../src/protocol'
import type { Receipt } from '../src'
import type { HostFrame } from '../src/server'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const pricer = defineAgent({
  name: 'pricer',
  description: 'Prices a vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => ({ vendor: ctx.input.vendor, cents: 1200 }),
})
const secret = defineAgent({
  name: 'secret',
  description: 'Not for clients',
  run: async () => 'hidden',
})

function setup(
  replies: Array<Reply> = [() => text('hello'), () => text('again')],
) {
  const { adapter, calls } = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/protocol',
    adapter,
    agents: [pricer, secret],
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
  return { handler, host, harness, calls }
}

const auth = { authorization: 'Bearer good' }
const user = { id: 'user-1' }

type Handler = ReturnType<typeof setup>['handler']

/** POST one input to `/control` for `threadId`. Resolves to the JSON body. */
function controlOf(handler: Handler, threadId: string) {
  return async (input: unknown): Promise<unknown> =>
    (
      await handler(
        new Request('http://x/api/harness/control', {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ threadId, input }),
        }),
      )
    ).json()
}

const isTurnEnd = (frame: HostFrame) =>
  frame.type === 'harness.event' &&
  frame.event.type === 'CUSTOM' &&
  frame.event.name === 'harness.operation.finished'

describe('HTTP handler', () => {
  it('refuses requests that authorize rejects', async () => {
    const { handler, host } = setup()
    const response = await handler(
      new Request('http://x/api/harness/capabilities'),
    )
    expect(response.status).toBe(401)
    await host.close()
  })

  it('refuses threads the user cannot access', async () => {
    const { handler, host, harness } = setup()
    await host.open(harness, {
      threadId: 'other-thread',
      user: { id: 'user-2' },
    })
    const response = await handler(
      new Request('http://x/api/harness/snapshot?threadId=other-thread', {
        headers: auth,
      }),
    )
    expect(response.status).toBe(403)
    await host.close()
  })

  it('lists only exposed agents in the capabilities', async () => {
    const { handler, host } = setup()
    const response = await handler(
      new Request('http://x/api/harness/capabilities', { headers: auth }),
    )
    const body = await response.json()
    expect(body.identity.name).toBe('test/protocol')
    expect(
      body.custom.tanstack.agents.map((agent: { name: string }) => agent.name),
    ).toEqual(['pricer'])
    expect(
      body.custom.tanstack.agents[0].inputSchema.properties.vendor.type,
    ).toBe('string')
    await host.close()
  })

  it('serves a standard AG-UI run as SSE', async () => {
    const { handler, host } = setup()
    const response = await handler(
      new Request('http://x/api/harness/run', {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: 'user-1-thread',
          runId: 'client-run',
          messages: [{ id: 'm1', role: 'user', content: 'hi' }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        }),
      }),
    )
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await response.text()
    expect(text).toContain('"delta":"hello"')
    expect(text).toContain('RUN_FINISHED')
    await host.close()
  })

  it('takes control inputs, streams session events, and resumes from a cursor', async () => {
    const { handler, host } = setup()
    const control = controlOf(handler, 'user-1-t')

    expect(await control({ op: 'prompt', message: 'hi' })).toMatchObject({
      status: 'accepted',
    })

    const first = await readSse(
      await handler(
        new Request('http://x/api/harness/events?threadId=user-1-t', {
          headers: auth,
        }),
      ),
      isTurnEnd,
    )
    // The hello comes first, then the events.
    expect(first[0]).toEqual({
      type: 'harness.hello',
      v: 2,
      threadId: 'user-1-t',
    })
    expect(
      first.slice(1).every((frame) => frame.type === 'harness.event'),
    ).toBe(true)
    const last = first.at(-1)
    const cursor = last?.type === 'harness.event' ? last.cursor : ''

    await control({ op: 'prompt', message: 'more' })
    const second = await readSse(
      await handler(
        new Request('http://x/api/harness/events?threadId=user-1-t', {
          headers: { ...auth, 'Last-Event-ID': cursor },
        }),
      ),
      isTurnEnd,
    )
    expect(
      second
        .slice(1)
        .every(
          (frame) =>
            frame.type === 'harness.event' &&
            Number(frame.cursor) > Number(cursor),
        ),
    ).toBe(true)
    expect(JSON.stringify(second)).toContain('again')
    await host.close()
  })

  it('answers a retried prompt with the same inputId with the first receipt', async () => {
    const { handler, host, calls } = setup()
    const control = controlOf(handler, 'user-1-retry')

    const first = await control({ op: 'prompt', message: 'hi', inputId: 'c-1' })
    const retry = await control({ op: 'prompt', message: 'hi', inputId: 'c-1' })

    expect(first).toMatchObject({ inputId: 'c-1', status: 'accepted' })
    expect(retry).toEqual(first)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(
      await control({ op: 'prompt', message: 'another', inputId: 'c-1' }),
    ).toMatchObject({ status: 'rejected', reason: 'conflict' })
    expect(await control({ op: 'prompt', message: 'x', inputId: 7 })).toEqual({
      error: 'Invalid input: inputId must be a string.',
    })
    await host.close()
  })

  it('runs a resent command or agent start with the same inputId once', async () => {
    const runs = { command: 0, agent: 0 }
    const counter = defineAgent({
      name: 'counter',
      description: 'Counts its runs',
      run: async () => ++runs.agent,
    })
    const harness = defineHarness({
      name: 'test/protocol-resend',
      adapter: mockAdapter([]).adapter,
      agents: [counter],
      plugins: () => [
        definePlugin({
          name: 'test/count',
          setup: () => ({
            commands: {
              count: defineCommand({
                description: 'Counts its runs',
                run: () => ++runs.command,
              }),
            },
          }),
        }),
      ],
      expose: { agents: ['counter'], commands: ['count'] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 'resend' })

    // The operation of a receipt ends, also as a duplicate.
    const settled = (receipt: Receipt) =>
      receipt.operationId === undefined
        ? undefined
        : session.operation(receipt.operationId)?.then(
            () => {},
            () => {},
          )
    const command = { op: 'command', name: 'count', inputId: 'c-1' } as const
    const first = await applyInput({ harness, session, input: command })
    expect(first).toMatchObject({ inputId: 'c-1', status: 'accepted' })
    await vi.waitFor(() => expect(runs.command).toBe(1), { timeout: 5000 })
    await settled(await applyInput({ harness, session, input: command }))

    const agent = { op: 'agent', agent: 'counter', inputId: 'a-1' } as const
    expect(await applyInput({ harness, session, input: agent })).toMatchObject({
      inputId: 'a-1',
      status: 'accepted',
    })
    await vi.waitFor(() => expect(runs.agent).toBe(1), { timeout: 5000 })
    await settled(await applyInput({ harness, session, input: agent }))

    expect(runs).toEqual({ command: 1, agent: 1 })
    await host.close()
  })

  it('writes the records of a resent append with the same inputId once', async () => {
    const persistence = memoryPersistence()
    const harness = defineHarness({
      name: 'test/protocol-append',
      adapter: mockAdapter([]).adapter,
      expose: { records: ['app.signal'] },
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness, { threadId: 'append' })
    const input = {
      op: 'append' as const,
      records: [{ type: 'app.signal', text: 'The build failed.' }],
      inputId: 'ap-1',
    }

    const first = await applyInput({ harness, session, input })
    const again = await applyInput({ harness, session, input })

    expect(first).toEqual({ inputId: 'ap-1', status: 'accepted' })
    expect(again).toEqual(first)
    const signals = (
      await persistence.stores.log.read({ logId: logIdOf({ logId: 'append' }) })
    ).filter(({ record }) => record.type === 'app.signal')
    expect(signals).toHaveLength(1)
    await host.close()
  })

  it('runs exposed agents from a client and refuses the others', async () => {
    const { handler, host } = setup()
    const control = controlOf(handler, 'user-1-a')

    expect(await control({ op: 'agent', agent: 'secret' })).toMatchObject({
      status: 'rejected',
      reason: 'not_exposed',
    })
    expect(
      await control({ op: 'agent', agent: 'pricer', input: { vendor: 'x' } }),
    ).toMatchObject({
      status: 'accepted',
    })
    expect(await control({ op: 'launch' })).toMatchObject({
      error: expect.stringContaining('Invalid input'),
    })
    await host.close()
  })

  it('sends messages to runs of exposed agents only', async () => {
    const { handler, host, harness } = setup()
    const control = async (input: unknown) =>
      (
        await handler(
          new Request('http://x/api/harness/control', {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({ threadId: 'user-1-m', input }),
          }),
        )
      ).json()

    const started = await control({
      op: 'agent',
      agent: 'pricer',
      input: { vendor: 'x' },
    })
    expect(
      await control({
        op: 'agentMessage',
        operationId: started.operationId,
        message: 'In euros.',
        mode: 'followUp',
      }),
    ).toMatchObject({ status: expect.stringMatching(/^(accepted|queued)$/) })

    const session = await host.open(harness, {
      threadId: 'user-1-m',
      user,
    })
    const hidden = session.agent('secret')?.start()
    expect(
      await control({
        op: 'agentMessage',
        operationId: hidden?.id,
        message: 'Hello.',
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    expect(
      await control({
        op: 'agentMessage',
        operationId: 'op-agent-none',
        message: 'Hello.',
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_running' })
    expect(await control({ op: 'agentMessage', message: 'Hello.' })).toEqual({
      error: 'Invalid input: agentMessage needs an operationId.',
    })
    await host.close()
  })

  it('moves and cancels a waiting input, and the snapshot lists it', async () => {
    const release = gate()
    const { handler, host, calls } = setup([after(release.opened, 'hello')])
    const control = controlOf(handler, 'user-1-wait')
    const snapshot = async () =>
      (
        await handler(
          new Request('http://x/api/harness/snapshot?threadId=user-1-wait', {
            headers: auth,
          }),
        )
      ).json()
    await control({ op: 'prompt', message: 'hi' })
    // The model call runs, so a steer can join only at a later call.
    await waitFor(() => expect(calls).toHaveLength(1))
    await control({ op: 'followUp', message: 'later', inputId: 'f-1' })

    expect(
      await control({ op: 'setDelivery', inputId: 'f-1', delivery: 'steer' }),
    ).toMatchObject({ status: 'accepted' })
    expect(await snapshot()).toMatchObject({
      waitingInputs: [{ inputId: 'f-1', delivery: 'steer', message: 'later' }],
    })
    expect(await control({ op: 'cancelInput', inputId: 'f-1' })).toMatchObject({
      status: 'accepted',
    })
    expect(await snapshot()).toMatchObject({ waitingInputs: [] })
    expect(await control({ op: 'cancelInput', inputId: 'f-1' })).toMatchObject({
      status: 'rejected',
      reason: 'not_waiting',
    })
    release.open()
    await host.close()
  })

  it('drops the wake mark of a client follow-up', async () => {
    const { handler, host, harness, calls } = setup([() => text('ok')])
    const control = controlOf(handler, 'user-1-wake')

    await control({ op: 'followUp', message: 'I am real', wake: true })

    await waitFor(() => expect(calls).toHaveLength(1))
    const session = await host.open(harness, {
      threadId: 'user-1-wake',
      user,
    })
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(wakeMessages(await session.transcript())).toEqual([])
    await host.close()
  })
})

describe('parseHarnessInput', () => {
  it('drops the wake mark of a follow-up, which only the harness sets', () => {
    expect(
      parseHarnessInput({ op: 'followUp', message: 'hi', wake: true }),
    ).toEqual({ op: 'followUp', message: 'hi' })
  })

  it('lets a client send background without an expose entry', async () => {
    const { handler, host } = setup()
    const control = controlOf(handler, 'user-1-bg')
    expect(await control({ op: 'background' })).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    expect(() =>
      parseHarnessInput({ op: 'background', toolCallId: 1 }),
    ).toThrow('Invalid input: the toolCallId of background must be a string.')
    await host.close()
  })

  it('checks the fields of cancelInput and setDelivery', () => {
    expect(() => parseHarnessInput({ op: 'cancelInput' })).toThrow(
      'Invalid input: cancelInput needs an inputId.',
    )
    expect(() =>
      parseHarnessInput({ op: 'setDelivery', inputId: 'a', delivery: 'now' }),
    ).toThrow("Invalid input: setDelivery needs 'steer' or 'queue'.")
  })

  it('refuses a message part without the fields the harness reads', () => {
    // An image with no source, then a data source with no MIME type.
    for (const part of [
      { type: 'image' },
      { type: 'image', source: { type: 'data', value: 'aGVsbG8=' } },
    ]) {
      expect(() =>
        parseHarnessInput({ op: 'prompt', message: [part] }),
      ).toThrow(
        'Invalid input: prompt needs a message: text, or content parts.',
      )
    }
    expect(() =>
      parseHarnessInput({
        op: 'continue',
        ephemeral: [{ role: 'user', content: [{ type: 'audio' }] }],
      }),
    ).toThrow('Invalid input: ephemeral must be an array of user messages.')
  })

  it('reports the WebSocket in capabilities only when the app serves it', async () => {
    const { host, harness } = setup()
    const transportOf = async (socket?: boolean) => {
      const handler = createHarnessHandler({
        host,
        harness,
        ...(socket === undefined ? {} : { socket }),
      })
      const response = await handler(
        new Request('http://x/api/harness/capabilities', { headers: auth }),
      )
      const body: unknown = await response.json()
      return body
    }

    expect(await transportOf()).toMatchObject({
      transport: { streaming: true, websocket: false },
    })
    expect(await transportOf(true)).toMatchObject({
      transport: { streaming: true, websocket: true },
    })
    await host.close()
  })

  it('checks the ephemeral messages of prompt and continue', () => {
    const refused =
      'Invalid input: ephemeral must be an array of user messages.'
    expect(() =>
      parseHarnessInput({ op: 'prompt', message: 'hi', ephemeral: 'note' }),
    ).toThrow(refused)
    // A client cannot fake an answer or a tool result.
    for (const role of ['system', 'assistant', 'tool']) {
      expect(() =>
        parseHarnessInput({
          op: 'continue',
          ephemeral: [{ role, content: 'note' }],
        }),
      ).toThrow(refused)
    }
    const ephemeral = [{ role: 'user', content: 'note' }]
    expect(parseHarnessInput({ op: 'continue', ephemeral })).toEqual({
      op: 'continue',
      ephemeral,
    })
  })
})

describe('WebSocket', () => {
  it('subscribes, applies inputs with receipts, and streams events', async () => {
    const { host, harness } = setup()
    const { socket, sent, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: new Request('http://x/api/harness/socket', { headers: auth }),
    })

    receive({
      type: 'harness.input',
      requestId: 'r0',
      input: { op: 'prompt', message: 'x' },
    })
    await waitFor(() => expect(sent.at(-1)?.type).toBe('harness.error'))

    receive({ type: 'harness.subscribe', threadId: 'user-1-ws' })
    await waitFor(() =>
      expect(sent.some((frame) => frame.type === 'harness.hello')).toBe(true),
    )
    receive({
      type: 'harness.input',
      requestId: 'r1',
      input: { op: 'prompt', message: 'hi' },
    })

    await waitFor(() =>
      expect(
        sent.some(
          (frame) =>
            frame.type === 'harness.event' &&
            frame.event.type === 'CUSTOM' &&
            frame.event.name === 'harness.operation.finished',
        ),
      ).toBe(true),
    )
    expect(
      sent.find((frame) => frame.type === 'harness.receipt'),
    ).toMatchObject({
      requestId: 'r1',
      status: 'accepted',
    })
    receive({ type: 'harness.snapshot' })
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        type: 'harness.snapshot',
        snapshot: { status: 'idle' },
      }),
    )
    socket.close()
    await host.close()
  })
})

describe('WebSocket frame order', () => {
  it('applies the inputs of one socket in the order they came', async () => {
    const { host, harness } = setup()
    const { socket, sent, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: new Request('http://x/api/harness/socket', { headers: auth }),
    })
    receive({ type: 'harness.subscribe', threadId: 'user-1-order' })
    await vi.waitFor(
      () =>
        expect(sent.some((frame) => frame.type === 'harness.hello')).toBe(true),
      { timeout: 5000 },
    )

    // The first input stores its image before it reaches the session. The
    // second is text only, so it is faster on its own.
    const image = {
      type: 'image',
      source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
    }
    receive({
      type: 'harness.input',
      requestId: 'first',
      input: { op: 'prompt', inputId: 'first', message: [image] },
    })
    receive({
      type: 'harness.input',
      requestId: 'second',
      input: { op: 'prompt', inputId: 'second', message: 'B' },
    })

    const receipts = () =>
      sent.flatMap((frame) =>
        frame.type === 'harness.receipt' ? [frame.requestId] : [],
      )
    await vi.waitFor(() => expect(receipts()).toHaveLength(2), {
      timeout: 5000,
    })
    expect(receipts()).toEqual(['first', 'second'])
    socket.close()
    await host.close()
  })
})

describe('parseControlFrame', () => {
  it('rejects unknown frames', () => {
    expect(() => parseControlFrame('{"type":"nope"}')).toThrow('unknown type')
    expect(() =>
      parseControlFrame('{"type":"harness.input","requestId":"1","input":{}}'),
    ).toThrow('Invalid input')
  })

  it('keeps the v of a subscribe, and refuses a v that is not a number', () => {
    expect(
      parseControlFrame('{"type":"harness.subscribe","threadId":"t","v":2}'),
    ).toEqual({ type: 'harness.subscribe', threadId: 't', v: 2 })
    expect(() =>
      parseControlFrame('{"type":"harness.subscribe","threadId":"t","v":"2"}'),
    ).toThrow('v must be a number')
  })

  it('keeps a valid traceparent of an input, and drops an invalid one', () => {
    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    const frame = (value: string) =>
      parseControlFrame(
        JSON.stringify({
          type: 'harness.input',
          requestId: 'r1',
          input: { op: 'prompt', message: 'hi' },
          traceparent: value,
        }),
      )
    expect(frame(traceparent)).toMatchObject({ traceparent })
    expect(frame('not-a-traceparent')).not.toHaveProperty('traceparent')
  })
})

describe('versionError', () => {
  it('takes the current version, and no version', () => {
    expect(HARNESS_PROTOCOL_VERSION).toBe(2)
    expect(versionError(undefined)).toBeUndefined()
    expect(versionError(2)).toBeUndefined()
  })

  it('refuses another version', () => {
    expect(versionError(1)).toEqual({
      message:
        'Protocol version 1 is not supported. This host speaks version 2.',
      code: 'unsupported_version',
    })
  })
})

describe('requestIdOf', () => {
  it('reads the requestId of a frame that fails the full parse', () => {
    const badInput = '{"type":"harness.input","requestId":"r9","input":{}}'
    expect(() => parseControlFrame(badInput)).toThrow('Invalid input')
    expect(requestIdOf(badInput)).toBe('r9')
  })

  it('never throws', () => {
    expect(requestIdOf('{not json')).toBeUndefined()
    expect(requestIdOf('null')).toBeUndefined()
    expect(requestIdOf('{"requestId":7}')).toBeUndefined()
  })
})

describe('traceparent on an input', () => {
  const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

  it('applyInput passes the traceparent to the send of a message', async () => {
    const { host, harness } = setup()
    const session = await host.open(harness, {
      threadId: 'user-1-trace',
      user,
    })
    const send = vi.spyOn(session, 'send')

    await applyInput({
      harness,
      session,
      input: { op: 'prompt', message: 'hi' },
      user,
      traceparent,
    })
    await applyInput({
      harness,
      session,
      input: { op: 'steer', message: 'more' },
      user,
      traceparent,
    })

    expect(send.mock.calls.map(([, options]) => options?.traceparent)).toEqual([
      traceparent,
      traceparent,
    ])
    await session.close()
    await host.close()
  })
})
