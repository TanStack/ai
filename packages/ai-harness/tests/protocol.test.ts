import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
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
  negotiateVersion,
  requestIdOf,
} from '../src/protocol'
import type { HostFrame } from '../src/server'
import type { Reply } from './helpers'

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
      identify: ({ request }) =>
        request.headers.get('authorization') === 'Bearer good' ? user : null,
      // A user may use the threads whose id starts with the user id.
      authorize: ({ principal, session }) =>
        session.threadId.startsWith(principal.id),
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

  it('refuses threads the principal cannot access', async () => {
    const { handler, host, harness } = setup()
    await host.open(harness, {
      threadId: 'other-thread',
      principal: { id: 'user-2' },
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
    expect(first.every((frame) => frame.type === 'harness.event')).toBe(true)
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
      second.every(
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
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(
      await control({ op: 'prompt', message: 'another', inputId: 'c-1' }),
    ).toMatchObject({ status: 'rejected', reason: 'conflict' })
    expect(await control({ op: 'prompt', message: 'x', inputId: 7 })).toEqual({
      error: 'Invalid input: inputId must be a string.',
    })
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
      principal: user,
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
    await vi.waitFor(() => expect(calls).toHaveLength(1))
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

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const session = await host.open(harness, {
      threadId: 'user-1-wake',
      principal: user,
    })
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
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
    await vi.waitFor(() => expect(sent.at(-1)?.type).toBe('harness.error'))

    receive({ type: 'harness.subscribe', threadId: 'user-1-ws' })
    await vi.waitFor(() =>
      expect(sent.some((frame) => frame.type === 'harness.hello')).toBe(true),
    )
    receive({
      type: 'harness.input',
      requestId: 'r1',
      input: { op: 'prompt', message: 'hi' },
    })

    await vi.waitFor(() =>
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
    await vi.waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        type: 'harness.snapshot',
        snapshot: { status: 'idle' },
      }),
    )
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

describe('negotiateVersion', () => {
  it('uses the current version when the client names none', () => {
    expect(HARNESS_PROTOCOL_VERSION).toBe(2)
    expect(negotiateVersion({})).toEqual({ v: 2 })
    expect(negotiateVersion({ requested: 2 })).toEqual({ v: 2 })
  })

  it('refuses a version that the host does not speak, and lists the ones it does', () => {
    expect(negotiateVersion({ requested: 1 })).toEqual({
      error: {
        message: 'Protocol version 1 is not supported.',
        code: 'unsupported_version',
        supported: [2],
      },
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
