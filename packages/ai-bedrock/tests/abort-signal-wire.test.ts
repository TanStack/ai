import { describe, expect, it, vi } from 'vitest'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../src/adapters/converse-text'
import { createBedrockResponsesText } from '../src/adapters/responses-text'
import { createBedrockChat } from '../src/adapters/text'

const logger = resolveDebugOption(false)

/**
 * A fake `fetch` that never answers. It rejects at once when it gets no abort
 * signal. Otherwise it rejects only when its signal aborts.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (!signal) return Promise.reject(new Error('fetch got no abort signal'))
    signals.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason))
    })
  })
  return { fetch, signals }
}

/** Starts the call, aborts the caller, and expects the request to abort. */
async function expectAbortReachesFetch(
  wire: ReturnType<typeof hangingFetch>,
  start: (signal: AbortSignal) => Promise<unknown>,
) {
  const controller = new AbortController()
  const run = start(controller.signal)
  run.catch(() => {})
  await vi.waitFor(() => expect(wire.fetch).toHaveBeenCalled())
  controller.abort()
  await vi.waitFor(
    () => expect(wire.signals.at(-1)?.aborted, 'request aborted').toBe(true),
    { timeout: 500 },
  )
  await expect(run).rejects.toBeDefined()
}

/** Drains a stream. A RUN_ERROR chunk counts as a rejection. */
async function drain(stream: AsyncIterable<{ type: string }>) {
  for await (const chunk of stream) {
    if (chunk.type === EventType.RUN_ERROR) throw new Error('RUN_ERROR')
  }
}

const messages = [{ role: 'user' as const, content: 'Hi' }]
const outputSchema = { type: 'object', properties: {} }
const converseModel = 'us.amazon.nova-pro-v1:0'
const mantleModel = 'openai.gpt-oss-120b-1:0'

/** A Converse adapter whose AWS SDK client sends through the fake fetch. */
function converseAdapter(wire: ReturnType<typeof hangingFetch>) {
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: {
      handle: (_request: unknown, options?: { abortSignal?: AbortSignal }) =>
        wire.fetch('https://bedrock.test', {
          ...(options?.abortSignal && { signal: options.abortSignal }),
        }),
    },
  })
  class WireAdapter extends BedrockConverseTextAdapter<typeof converseModel> {
    protected override async getClient(): Promise<BedrockRuntimeClient> {
      return client
    }
  }
  return new WireAdapter({ apiKey: 'test-key' }, converseModel)
}

describe('Bedrock Converse aborts the provider request', () => {
  it('chatStream', async () => {
    const wire = hangingFetch()
    const adapter = converseAdapter(wire)
    await expectAbortReachesFetch(wire, (signal) =>
      drain(
        adapter.chatStream({
          threadId: 'thread-1',
          logger,
          model: converseModel,
          messages,
          request: { signal },
        }),
      ),
    )
  })

  it('structuredOutput', async () => {
    const wire = hangingFetch()
    const adapter = converseAdapter(wire)
    await expectAbortReachesFetch(wire, (signal) =>
      adapter.structuredOutput({
        chatOptions: {
          threadId: 'thread-1',
          logger,
          model: converseModel,
          messages,
          request: { signal },
        },
        outputSchema,
      }),
    )
  })

  it('structuredOutputStream', async () => {
    const wire = hangingFetch()
    const adapter = converseAdapter(wire)
    await expectAbortReachesFetch(wire, (signal) =>
      drain(
        adapter.structuredOutputStream({
          chatOptions: {
            threadId: 'thread-1',
            logger,
            model: converseModel,
            messages,
            request: { signal },
          },
          outputSchema,
        }),
      ),
    )
  })
})

describe.each([
  ['Mantle chat', createBedrockChat],
  ['Mantle responses', createBedrockResponsesText],
] as const)('Bedrock %s aborts the provider request', (_name, create) => {
  function adapter(wire: ReturnType<typeof hangingFetch>) {
    return create(mantleModel, 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
  }

  it('chatStream', async () => {
    const wire = hangingFetch()
    const a = adapter(wire)
    await expectAbortReachesFetch(wire, (signal) =>
      drain(
        a.chatStream({
          threadId: 'thread-1',
          logger,
          model: mantleModel,
          messages,
          request: { signal },
        }),
      ),
    )
  })

  it('structuredOutput', async () => {
    const wire = hangingFetch()
    const a = adapter(wire)
    await expectAbortReachesFetch(wire, (signal) =>
      a.structuredOutput({
        chatOptions: {
          threadId: 'thread-1',
          logger,
          model: mantleModel,
          messages,
          request: { signal },
        },
        outputSchema,
      }),
    )
  })
})
