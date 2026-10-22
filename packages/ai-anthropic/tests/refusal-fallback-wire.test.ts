import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'claude-opus-5-5'
const fallbackModel = 'claude-opus-4-8'

const sse = (events: Array<object>) =>
  new Response(
    events
      .map(
        (event) =>
          `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )

const messageStart = (servedBy: string) => ({
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: servedBy,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 297, output_tokens: 0 },
  },
})

const messageEnd = (
  stopReason: string,
  stopDetails: object | null = null,
): Array<object> => [
  {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: stopDetails,
    },
    usage: { output_tokens: 0 },
  },
  { type: 'message_stop' },
]

const fallbackBlock = (index: number): Array<object> => [
  {
    type: 'content_block_start',
    index,
    content_block: {
      type: 'fallback',
      from: { model },
      to: { model: fallbackModel },
    },
  },
  { type: 'content_block_stop', index },
]

const textBlock = (index: number, text: string): Array<object> => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  },
  { type: 'content_block_stop', index },
]

const bioRefusal = () =>
  sse([
    messageStart(model),
    ...messageEnd('refusal', {
      type: 'refusal',
      category: 'bio',
      explanation: null,
    }),
  ])

const servedByFallback = () =>
  sse([
    messageStart(fallbackModel),
    ...fallbackBlock(0),
    ...textBlock(1, 'Here is the answer.'),
    ...messageEnd('end_turn'),
  ])

const midOutputHandoff = () =>
  sse([
    messageStart(model),
    ...textBlock(0, 'Partial '),
    ...fallbackBlock(1),
    ...textBlock(2, 'answer.'),
    ...messageEnd('end_turn'),
  ])

/** Runs one chat call that gets `response`. Gives back the chunks and the request. */
async function run(
  response: Response,
  modelOptions: Record<string, unknown> = {},
) {
  let request: { body: Record<string, unknown>; headers: Headers } | undefined
  const adapter = createAnthropicChat(model, 'test-key', {
    maxRetries: 0,
    fetch: async (_input, init) => {
      request = {
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      }
      return response
    },
  })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of adapter.chatStream({
    logger,
    model,
    threadId: 'thread-1',
    messages: [{ role: 'user', content: 'Hi' }],
    modelOptions,
  })) {
    chunks.push(chunk)
  }
  return { chunks, request }
}

const runFinished = (chunks: Array<StreamChunk>) =>
  chunks.find((chunk) => chunk.type === 'RUN_FINISHED')

describe('Anthropic server-side fallback request', () => {
  it('sends fallbacks in the request body', async () => {
    const { request } = await run(servedByFallback(), { fallbacks: 'default' })
    expect(request?.body.fallbacks).toBe('default')
  })

  it('sends the server-side fallback beta header', async () => {
    const { request } = await run(servedByFallback(), { fallbacks: 'default' })
    expect(request?.headers.get('anthropic-beta')).toContain(
      'server-side-fallback-2026-07-01',
    )
  })

  it('does not send the beta header without fallbacks', async () => {
    const { request } = await run(servedByFallback())
    expect(request?.headers.get('anthropic-beta') ?? '').not.toContain(
      'server-side-fallback',
    )
  })
})

describe('Anthropic refusal that no fallback served', () => {
  it('finishes with the content_filter finish reason', async () => {
    const { chunks } = await run(bioRefusal())
    expect(runFinished(chunks)).toMatchObject({
      finishReason: 'content_filter',
    })
  })

  it('carries the refusal category in rawEvent', async () => {
    const { chunks } = await run(bioRefusal())
    expect(runFinished(chunks)?.rawEvent).toMatchObject({ category: 'bio' })
  })

  it('does not emit RUN_ERROR', async () => {
    const { chunks } = await run(bioRefusal())
    expect(chunks.some((chunk) => chunk.type === 'RUN_ERROR')).toBe(false)
  })
})

describe('Anthropic response served by a fallback model', () => {
  it('streams the fallback model text', async () => {
    const { chunks } = await run(servedByFallback(), { fallbacks: 'default' })
    const text = chunks
      .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
      .map((chunk) => chunk.delta)
      .join('')
    expect(text).toBe('Here is the answer.')
  })

  it('finishes with the stop finish reason', async () => {
    const { chunks } = await run(servedByFallback(), { fallbacks: 'default' })
    expect(runFinished(chunks)).toMatchObject({ finishReason: 'stop' })
  })

  it('names the fallback model on the run', async () => {
    const { chunks } = await run(servedByFallback(), { fallbacks: 'default' })
    expect(runFinished(chunks)?.model).toBe(fallbackModel)
  })

  it('names the fallback model after a mid-output handoff', async () => {
    const { chunks } = await run(midOutputHandoff(), { fallbacks: 'default' })
    expect(runFinished(chunks)?.model).toBe(fallbackModel)
  })

  it('balances text message start and end across a mid-output handoff', async () => {
    const { chunks } = await run(midOutputHandoff(), { fallbacks: 'default' })
    const count = (type: string) =>
      chunks.filter((chunk) => chunk.type === type).length
    const text = chunks
      .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
      .map((chunk) => chunk.delta)
      .join('')
    expect(text).toBe('Partial answer.')
    expect(count('TEXT_MESSAGE_START')).toBe(2)
    expect(count('TEXT_MESSAGE_END')).toBe(2)
  })
})
