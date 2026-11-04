import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockEmbeddingAdapter } from '../src/adapters/embedding'

const logger = resolveDebugOption(false)

/** Records the `send` options; hangs until their `abortSignal` aborts. */
class HangingClientAdapter extends BedrockEmbeddingAdapter<'amazon.titan-embed-text-v2:0'> {
  signals: Array<AbortSignal | undefined> = []

  protected override importBedrockRuntime(): any {
    return Promise.resolve({
      InvokeModelCommand: class {
        constructor(readonly input: unknown) {}
      },
    })
  }

  protected override getClient(): any {
    return Promise.resolve({
      send: (_command: unknown, options?: { abortSignal?: AbortSignal }) => {
        const signal = options?.abortSignal
        this.signals.push(signal)
        if (!signal) return Promise.reject(new Error('request had no signal'))
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        })
      },
    })
  }
}

describe('bedrock embedding forwards abortSignal to InvokeModel', () => {
  it('aborts the in-flight send', async () => {
    const adapter = new HangingClientAdapter(
      { region: 'us-east-1' },
      'amazon.titan-embed-text-v2:0',
    )
    const controller = new AbortController()
    const pending = adapter.createEmbeddings({
      model: 'amazon.titan-embed-text-v2:0',
      input: ['a'],
      logger,
      abortSignal: controller.signal,
    })
    await vi.waitFor(() => expect(adapter.signals).toHaveLength(1))
    expect(adapter.signals[0]).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow()
  })
})
