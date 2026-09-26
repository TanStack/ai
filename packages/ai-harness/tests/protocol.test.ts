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
} from '../src'
import { mockAdapter, text } from './helpers'
import type { WebSocketLike } from '@tanstack/ai'
import type { HostFrame } from '../src'

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

function setup(replies = [() => text('hello'), () => text('again')]) {
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

async function readSse(response: Response, until: (data: any) => boolean) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const frames: Array<any> = []
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
      const parsed = JSON.parse(data)
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
    const control = (input: unknown) =>
      handler(
        new Request('http://x/api/harness/control', {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ threadId: 'user-1-t', input }),
        }),
      )

    const receipt = await (
      await control({ op: 'prompt', message: 'hi' })
    ).json()
    expect(receipt.status).toBe('accepted')

    const first = await readSse(
      await handler(
        new Request('http://x/api/harness/events?threadId=user-1-t', {
          headers: auth,
        }),
      ),
      (frame) => frame.event?.name === 'harness.operation.finished',
    )
    expect(first.every((frame) => frame.type === 'harness.event')).toBe(true)
    const cursor = first.at(-1).cursor

    await (await control({ op: 'prompt', message: 'more' })).json()
    const second = await readSse(
      await handler(
        new Request('http://x/api/harness/events?threadId=user-1-t', {
          headers: { ...auth, 'Last-Event-ID': cursor },
        }),
      ),
      (frame) => frame.event?.name === 'harness.operation.finished',
    )
    expect(second.every((frame) => Number(frame.cursor) > Number(cursor))).toBe(
      true,
    )
    expect(JSON.stringify(second)).toContain('again')
    await host.close()
  })

  it('runs exposed agents from a client and refuses the others', async () => {
    const { handler, host } = setup()
    const control = async (input: unknown) =>
      (
        await handler(
          new Request('http://x/api/harness/control', {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({ threadId: 'user-1-a', input }),
          }),
        )
      ).json()

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
