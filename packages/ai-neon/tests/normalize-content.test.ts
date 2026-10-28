import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { normalizeNeonContent } from '../src/utils/normalize-content'
import { createNeonText } from '../src/adapters/factory'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const HOST = 'https://br-test-api.ai.c-1.us-east-2.aws.neon.tech'

const encoder = new TextEncoder()

/** An SSE response whose body arrives in the given raw chunks. */
function sseResponse(chunks: Array<string>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

function chunk(delta: Record<string, unknown>, finish: string | null = null) {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gemini-3-8-flash',
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`
}

const arrayDelta = chunk({
  role: 'assistant',
  content: [
    {
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: 'Thinking.' }],
    },
    { type: 'text', text: 'Hello', thoughtSignature: 'sig' },
  ],
})

describe('normalizeNeonContent', () => {
  it('rewrites an array delta, even when a line is split across chunks', async () => {
    const stream = arrayDelta + chunk({}, 'stop') + 'data: [DONE]\n\n'
    const split = [stream.slice(0, 40), stream.slice(40, 90), stream.slice(90)]
    const fetch = normalizeNeonContent(async () => sseResponse(split))

    const text = await (await fetch('https://x/v1/chat/completions')).text()
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice(6)))

    expect(events[0].choices[0].delta.content).toBe('Hello')
    expect(events[0].choices[0].delta.reasoning_content).toBe('Thinking.')
    expect(text).toContain('data: [DONE]')
  })

  it('rewrites an array message in a JSON body', async () => {
    const fetch = normalizeNeonContent(async () =>
      Response.json({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: [
                { type: 'reasoning', text: 'Hmm.' },
                { type: 'text', text: '{"a":1}' },
              ],
            },
          },
        ],
      }),
    )

    const body = await (await fetch('https://x/v1/chat/completions')).json()

    expect(body.choices[0].message.content).toBe('{"a":1}')
    expect(body.choices[0].message.reasoning_content).toBe('Hmm.')
  })

  it.each([0, 272])(
    'normalizes top-level reasoning usage (%s tokens)',
    async (reasoningTokens) => {
      const usage = {
        prompt_tokens: 180,
        completion_tokens: 7,
        total_tokens: 187 + reasoningTokens,
        reasoning_tokens: reasoningTokens,
        completion_tokens_details: { audio_tokens: 2 },
      }
      const fetch = normalizeNeonContent(async () =>
        Response.json({ choices: [], usage }),
      )
      const body = await (await fetch('https://x')).json()
      expect(body.usage.completion_tokens_details).toEqual({
        audio_tokens: 2,
        reasoning_tokens: reasoningTokens,
      })
    },
  )

  it('preserves standard nested reasoning usage when both fields exist', async () => {
    const fetch = normalizeNeonContent(async () =>
      Response.json({
        choices: [],
        usage: {
          reasoning_tokens: 272,
          completion_tokens_details: { reasoning_tokens: 0, audio_tokens: 2 },
        },
      }),
    )
    const body = await (await fetch('https://x')).json()
    expect(body.usage.completion_tokens_details).toEqual({
      reasoning_tokens: 0,
      audio_tokens: 2,
    })
  })

  it('leaves string content and error responses alone', async () => {
    const plain = chunk({ content: 'Hi' })
    const fetch = normalizeNeonContent(async () => sseResponse([plain]))
    expect(await (await fetch('https://x')).text()).toBe(plain)

    const error = new Response('{"error":{"message":"no"}}', { status: 403 })
    const failing = normalizeNeonContent(async () => error)
    expect(await failing('https://x')).toBe(error)
  })

  it('gives chatStream text and reasoning, also through wrapFetch', async () => {
    const wrapFetch: FetchWrapper = (next) => (input, init) => next(input, init)
    const adapter = createNeonText('gemini-3-8-flash', 'nt-test', {
      baseURL: HOST,
      fetch: async () =>
        sseResponse([
          arrayDelta,
          chunk({}, 'stop'),
          `data: ${JSON.stringify({
            choices: [],
            usage: {
              prompt_tokens: 180,
              completion_tokens: 7,
              total_tokens: 459,
              reasoning_tokens: 272,
            },
          })}\n\n`,
          'data: [DONE]\n\n',
        ]),
    })

    const events: Array<{ type: string; delta?: string }> = []
    for await (const event of adapter.chatStream({
      logger,
      model: 'gemini-3-8-flash',
      threadId: 'thread-1',
      messages: [{ role: 'user', content: 'Hi' }],
      wrapFetch,
    })) {
      events.push(event as { type: string; delta?: string })
    }

    const types = events.map((event) => event.type)
    expect(types).not.toContain(EventType.RUN_ERROR)
    expect(
      events.find((event) => event.type === EventType.RUN_FINISHED),
    ).toMatchObject({
      usage: { completionTokensDetails: { reasoningTokens: 272 } },
    })
    expect(
      events.find((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
        ?.delta,
    ).toBe('Hello')
    expect(
      events.find((event) => event.type === EventType.REASONING_MESSAGE_CONTENT)
        ?.delta,
    ).toBe('Thinking.')
  })
})
