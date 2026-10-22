import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessText } from '../src'
import { createHarnessHandler } from '../src/server'
import { runHarnessWorker } from '../src/worker'
import { mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const textOf = (chunks: Array<StreamChunk>) =>
  chunks
    .map((chunk) =>
      chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : '',
    )
    .join('')

describe('harnessText for a remote harness', () => {
  it('sends the token and the last user message, and streams the answer', async () => {
    const { adapter, calls } = mockAdapter([() => text('remote answer')])
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: ({ request }) =>
          request.headers.get('authorization') === 'Bearer secret'
            ? { id: 'u' }
            : null,
        rules: { isAllowed: () => true },
      },
    })
    const handler = createHarnessHandler({
      host,
      harness: defineHarness({ name: 'test/remote', adapter }),
    })
    const remote = harnessText({
      url: 'http://remote.test/api/harness/',
      token: 'secret',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    expect(remote.model).toBe('http://remote.test/api/harness')
    const chunks = await collect(
      chat({
        adapter: remote,
        messages: [
          { role: 'user', content: 'older question' },
          { role: 'assistant', content: 'older answer' },
          { role: 'user', content: 'new question' },
        ],
        threadId: 'outer',
      }) as AsyncIterable<StreamChunk>,
    )
    expect(textOf(chunks)).toBe('remote answer')
    expect(JSON.stringify(calls[0].messages)).toContain('new question')
    expect(JSON.stringify(calls[0].messages)).not.toContain('older question')
    await expect(remote.structuredOutput({} as never)).rejects.toThrow(
      'does not support structured output',
    )
    await host.close()
  })

  it('reports a refused request', async () => {
    const remote = harnessText({
      url: 'http://remote.test',
      fetch: async () => new Response('unauthorized', { status: 401 }),
    })
    await expect(
      collect(
        remote.chatStream({
          model: 'x',
          messages: [{ role: 'user', content: 'hi' }],
        } as never),
      ),
    ).rejects.toThrow('Remote harness failed (401): unauthorized')
  })

  it('skips child and unknown data, and ends on a run error', async () => {
    const sse = [
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'kept',
        timestamp: 1,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c',
        delta: 'child',
        subagentRunId: 'x',
        timestamp: 1,
      },
      'not an object',
      { no: 'type' },
      { type: EventType.RUN_ERROR, message: 'remote broke', timestamp: 1 },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'after the error',
        timestamp: 1,
      },
    ]
      .map((data) => `data: ${JSON.stringify(data)}\n\n`)
      .join('')
    const remote = harnessText({
      url: 'http://remote.test',
      fetch: async () => new Response(`: comment\n\n${sse}`),
    })
    const chunks = await collect(
      remote.chatStream({
        model: 'x',
        runId: 'run-1',
        threadId: 'thread-1',
        messages: [],
      } as never),
    )
    expect(textOf(chunks)).toBe('kept')
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'remote broke',
    })
  })

  it('fails when the response has no body', async () => {
    const remote = harnessText({
      url: 'http://remote.test',
      fetch: async () => new Response(null, { status: 200 }),
    })
    const chunks = await collect(
      remote.chatStream({ model: 'x', messages: [] } as never),
    )
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_ERROR,
    ])
    expect(chunks.at(-1)).toMatchObject({
      message: 'The remote harness closed the stream before the run ended.',
    })
  })
})

describe('runHarnessWorker edges', () => {
  it('answers bad frames, a second subscribe, and snapshots, and resumes from a cursor', async () => {
    const { adapter } = mockAdapter([() => text('worker answer')])
    const input = new PassThrough()
    const frames: Array<any> = []
    const running = runHarnessWorker(
      defineHarness({ name: 'test/worker-edges', adapter }),
      {
        input,
        output: { write: (line: string) => frames.push(JSON.parse(line)) },
        persistence: memoryPersistence(),
      },
    )
    const send = (frame: unknown) =>
      input.write(
        `${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n`,
      )

    send('')
    send({ type: 'harness.snapshot' })
    await waitFor(() =>
      expect(frames.at(-1)).toEqual({
        type: 'harness.error',
        message: 'Send harness.subscribe first.',
        code: 'invalid_frame',
        requestId: expect.any(String),
      }),
    )
    send('{not json')
    await waitFor(() => expect(frames).toHaveLength(2))
    expect(frames[1]).toMatchObject({
      type: 'harness.error',
      code: 'invalid_frame',
      requestId: expect.any(String),
    })

    send({ type: 'harness.subscribe', threadId: 'w', from: '0' })
    await waitFor(() =>
      expect(frames.some((frame) => frame.type === 'harness.hello')).toBe(true),
    )
    send({ type: 'harness.subscribe', threadId: 'w' })
    await waitFor(() =>
      expect(frames.at(-1)).toEqual({
        type: 'harness.error',
        message: 'Already subscribed.',
        code: 'invalid_frame',
        requestId: expect.any(String),
      }),
    )
    send({ type: 'harness.snapshot' })
    await waitFor(() =>
      expect(frames.at(-1)).toMatchObject({
        type: 'harness.snapshot',
        snapshot: { threadId: 'w', status: 'idle' },
      }),
    )
    input.end()
    await running
  })

  it('names the requestId of a frame with a bad input', async () => {
    const { adapter } = mockAdapter([])
    const input = new PassThrough()
    const frames: Array<any> = []
    const running = runHarnessWorker(
      defineHarness({ name: 'test/worker-request-id', adapter }),
      {
        input,
        output: { write: (line: string) => frames.push(JSON.parse(line)) },
        persistence: memoryPersistence(),
      },
    )
    input.write(
      `${JSON.stringify({ type: 'harness.input', requestId: 'r7', input: {} })}
`,
    )
    await waitFor(() =>
      expect(frames.at(-1)).toMatchObject({
        type: 'harness.error',
        code: 'invalid_frame',
        requestId: 'r7',
      }),
    )
    input.end()
    await running
  })

  it('refuses a protocol version that it does not speak, and stops', async () => {
    const { adapter } = mockAdapter([])
    const input = new PassThrough()
    const frames: Array<any> = []
    const running = runHarnessWorker(
      defineHarness({ name: 'test/worker-version', adapter }),
      {
        input,
        output: { write: (line: string) => frames.push(JSON.parse(line)) },
        persistence: memoryPersistence(),
      },
    )
    input.write(
      `${JSON.stringify({ type: 'harness.subscribe', threadId: 'w', v: 1, requestId: 's1' })}
`,
    )
    // The worker ends without stdin closing.
    await running
    expect(frames).toEqual([
      {
        type: 'harness.error',
        message:
          'Protocol version 1 is not supported. This host speaks version 2.',
        code: 'unsupported_version',
        requestId: 's1',
      },
    ])
  })
})
