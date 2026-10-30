import { describe, expect, it } from 'vitest'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../../src/adapters/converse-text'

const logger = resolveDebugOption(false)
const model = 'us.amazon.nova-pro-v1:0'
const messages = [{ role: 'user' as const, content: 'Hi' }]
const outputSchema = { type: 'object', properties: {} }

/**
 * An adapter whose SDK client sends through a handler that never answers.
 * `sent` is the abort signal that the handler got for its one request, and
 * only that signal can end the request.
 */
function wireAdapter() {
  let onSend: (signal: AbortSignal | undefined) => void
  const sent = new Promise<AbortSignal | undefined>(
    (resolve) => (onSend = resolve),
  )
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: {
      handle(_request: unknown, options?: { abortSignal?: AbortSignal }) {
        return new Promise((_resolve, reject) => {
          const signal = options?.abortSignal
          onSend(signal)
          signal?.addEventListener('abort', () => reject(signal.reason))
        })
      },
    },
  })
  class WireAdapter extends BedrockConverseTextAdapter<typeof model> {
    protected override async getClient(): Promise<BedrockRuntimeClient> {
      return client
    }
  }
  return { adapter: new WireAdapter({ apiKey: 'test-key' }, model), sent }
}

describe('Bedrock Converse abort signal', () => {
  it('aborts the stream request when the caller aborts', async () => {
    const { adapter, sent } = wireAdapter()
    const abortController = new AbortController()
    const run = (async () => {
      for await (const _ of chat({
        adapter,
        threadId: 'thread-1',
        messages,
        abortController,
      })) {
        // drain
      }
    })()

    const signal = await sent
    abortController.abort()

    expect(signal?.aborted).toBe(true)
    await run
  })

  it('aborts the structured output request when the caller aborts', async () => {
    const { adapter, sent } = wireAdapter()
    const abortController = new AbortController()
    const run = chat({
      adapter,
      threadId: 'thread-1',
      messages,
      outputSchema,
      abortController,
    })

    const signal = await sent
    abortController.abort()

    expect(signal?.aborted).toBe(true)
    await expect(run).rejects.toThrow()
  })

  // `chat()` runs `structuredOutputStream` on Converse, so call it directly.
  it('aborts a structuredOutput call when the caller aborts', async () => {
    const { adapter, sent } = wireAdapter()
    const abortController = new AbortController()
    const run = adapter.structuredOutput({
      chatOptions: {
        threadId: 'thread-1',
        logger,
        model,
        messages,
        request: { signal: abortController.signal },
      },
      outputSchema,
    })

    const signal = await sent
    abortController.abort()

    expect(signal?.aborted).toBe(true)
    await expect(run).rejects.toThrow()
  })
})
