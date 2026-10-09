import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  handleHarnessSocket,
  parseControlFrame,
  parseHarnessInput,
} from '../src'
import { after, gate, mockAdapter, text } from './helpers'
import type { WebSocketLike } from '@tanstack/ai'
import type { HostFrame } from '../src'
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
  return { handler, host, harness, calls }
}

const auth = { authorization: 'Bearer good' }

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

async function readSse(
  response: Response,
  until: (frame: HostFrame) => boolean,
) {
  if (!response.body) throw new Error('The response has no body.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const frames: Array<HostFrame> = []
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
      // The handler writes each frame as JSON.
      const parsed: HostFrame = JSON.parse(data)
      frames.push(parsed)
      if (until(parsed)) {
        await reader.cancel()
        return frames
      }
    }
  }
  return frames
}

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
    const { handler, host } = setup()
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

    const session = await host.open(harness, { threadId: 'user-1-m' })
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
})

describe('parseHarnessInput', () => {
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
  function fakeSocket() {
    const handlers: Record<string, Array<(event?: any) => void>> = {}
    const sent: Array<HostFrame> = []
    const socket: WebSocketLike = {
      send: (data) => sent.push(JSON.parse(data)),
      close: () => handlers.close?.forEach((handler) => handler()),
      addEventListener: (type: string, handler: (event?: any) => void) => {
        ;(handlers[type] ??= []).push(handler)
      },
    }
    const receive = (frame: unknown) =>
      handlers.message?.forEach((handler) =>
        handler({ data: JSON.stringify(frame) }),
      )
    return { socket, sent, receive }
  }

  it('subscribes, applies inputs with receipts, and streams events', async () => {
    const { host, harness } = setup()
    const { socket, sent, receive } = fakeSocket()
    handleHarnessSocket({ host, harness, socket, principal: { id: 'user-1' } })

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
})
