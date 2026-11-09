import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenAIClient } from '../src/client'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { ClientOptions } from 'openai'
import type { OpenAIClientLike } from '../src/client'

type Fetch = NonNullable<ClientOptions['fetch']>

const model = 'test-model'

/** A fetch that never answers and rejects when the request aborts. */
const hangingFetch: Fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(init.signal?.reason ?? new Error('aborted')),
    )
  })

class Responses extends OpenAIBaseResponsesTextAdapter<string> {}
class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}

const clients = [
  {
    client: 'createOpenAIClient()',
    make: () =>
      createOpenAIClient({
        apiKey: 'test-key',
        maxRetries: 0,
        fetch: hangingFetch,
      }),
  },
  {
    client: 'new OpenAI()',
    make: () =>
      new OpenAI({ apiKey: 'test-key', maxRetries: 0, fetch: hangingFetch }),
  },
]

const apis = [
  {
    api: 'Responses',
    adapter: (client: OpenAIClientLike) =>
      new Responses(model, 'openai', client, { fetch: hangingFetch }),
  },
  {
    api: 'Chat Completions',
    adapter: (client: OpenAIClientLike) =>
      new Completions(model, 'openai', client, { fetch: hangingFetch }),
  },
]

describe.each(apis)('$api adapter: isAbortError', ({ adapter }) => {
  it('recognizes an APIUserAbortError from another copy of openai', () => {
    class APIUserAbortError extends Error {}
    const isAbortError = (
      adapter(createOpenAIClient({ apiKey: 'test-key' })) as unknown as {
        isAbortError: (error: unknown) => boolean
      }
    ).isAbortError(new APIUserAbortError('Request was aborted.'))
    expect(isAbortError).toBe(true)
  })

  it('returns false for an object with no prototype', () => {
    const isAbortError = (
      adapter(createOpenAIClient({ apiKey: 'test-key' })) as unknown as {
        isAbortError: (error: unknown) => boolean
      }
    ).isAbortError(Object.create(null))
    expect(isAbortError).toBe(false)
  })
})

const failingFetch: Fetch = async () =>
  new Response(JSON.stringify({ error: { message: 'boom' } }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  })

describe.each([
  { api: 'Responses', Adapter: Responses },
  { api: 'Chat Completions', Adapter: Completions },
])('$api adapter: a request failure', ({ Adapter }) => {
  it('logs fatal when the consumer stops at RUN_ERROR', async () => {
    const { error, logger } = errorsLogger()
    const client = createOpenAIClient({
      apiKey: 'test-key',
      maxRetries: 0,
      fetch: failingFetch,
    })
    for await (const chunk of new Adapter(model, 'openai', client, {
      fetch: failingFetch,
    }).chatStream({
      threadId: 'thread-1',
      logger,
      model,
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'RUN_ERROR') break
    }
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('.chatStream fatal'),
      expect.anything(),
    )
  })
})

const cases = clients.flatMap((c) => apis.map((a) => ({ ...c, ...a })))

function errorsLogger() {
  const error = vi.fn()
  const logger = resolveDebugOption({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error },
  })
  return { error, logger }
}

describe.each(cases)(
  '$api adapter on $client: a caller abort before the response',
  ({ make, adapter }) => {
    async function runAborted() {
      const { error, logger } = errorsLogger()
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10)
      const chunks = []
      for await (const chunk of adapter(make()).chatStream({
        threadId: 'thread-1',
        logger,
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        request: { signal: controller.signal },
      })) {
        chunks.push(chunk)
      }
      return { chunks, error }
    }

    it('yields a RUN_ERROR classified as aborted', async () => {
      const { chunks } = await runAborted()
      expect(chunks.at(-1)).toMatchObject({
        type: 'RUN_ERROR',
        code: 'aborted',
        metadata: { tanstack: { stopReason: 'aborted' } },
      })
    })

    it('logs nothing on the errors channel', async () => {
      const { error } = await runAborted()
      expect(error.mock.calls).toEqual([])
    })

    it('structuredOutput logs nothing on the errors channel', async () => {
      const { error, logger } = errorsLogger()
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10)
      await expect(
        adapter(make()).structuredOutput({
          chatOptions: {
            threadId: 'thread-1',
            logger,
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            request: { signal: controller.signal },
          },
          outputSchema: {
            type: 'object',
            properties: { a: { type: 'string' } },
            required: ['a'],
          },
        }),
      ).rejects.toThrow('Request was aborted.')
      expect(error.mock.calls).toEqual([])
    })
  },
)
