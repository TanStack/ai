import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { createGeminiChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

afterEach(() => {
  vi.unstubAllGlobals()
})

const textChunk = (text: string, finishReason?: string) => ({
  candidates: [
    {
      content: { role: 'model', parts: [{ text }] },
      index: 0,
      ...(finishReason && { finishReason }),
    },
  ],
  modelVersion: 'gemini-2.5-flash',
})

/** Runs chat() on one streamed body. Gives back the chunks and callbacks. */
async function run(chunks: Array<unknown>) {
  // @google/genai has no `fetch` option, so the global one is stubbed.
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        chunks
          .map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`)
          .join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  )
  const result = { chunks: new Array<StreamChunk>(), finish: 0, error: 0 }
  for await (const chunk of chat({
    threadId: 'thread-1',
    adapter: createGeminiChat('gemini-2.5-flash', 'test-key'),
    messages: [{ role: 'user', content: 'Hi' }],
    middleware: [
      {
        name: 'observe',
        onFinish: () => {
          result.finish++
        },
        onError: () => {
          result.error++
        },
      },
    ],
  })) {
    result.chunks.push(chunk)
  }
  return result
}

describe('Gemini stream that ends without a finishReason', () => {
  it('ends the run with a truncated-stream RUN_ERROR', async () => {
    const result = await run([textChunk('Hel')])
    expect(result.chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      code: 'truncated-stream',
    })
    expect(result).toMatchObject({ finish: 0, error: 1 })
    // The open text message is closed before the error.
    expect(result.chunks.at(-2)).toMatchObject({ type: 'TEXT_MESSAGE_END' })
  })

  it('still finishes a stream with a finishReason', async () => {
    const result = await run([textChunk('Hel'), textChunk('lo', 'STOP')])
    expect(result.chunks.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
    expect(result).toMatchObject({ finish: 1, error: 0 })
  })
})
