import { describe, expect, it, vi } from 'vitest'
import { embed } from '../src/activities/embed/index'
import { BaseEmbeddingAdapter } from '../src/activities/embed/adapter'
import {
  countEmbeddingInputModalities,
  requireTextOnlyEmbeddingInput,
  resolveEmbeddingInput,
} from '../src/utilities/embedding-input'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type {
  EmbeddingInputItem,
  EmbeddingOptions,
  EmbeddingResult,
  ImagePart,
  TextPart,
  TokenUsage,
} from '../src/types'

// ============================================================================
// Mock adapter
// ============================================================================

interface MockAdapterBehavior {
  usage?: TokenUsage
  error?: Error
  dimensions?: number
}

class MockEmbeddingAdapter extends BaseEmbeddingAdapter<
  'mock-embed',
  { inputType?: string }
> {
  readonly name = 'mock'
  calls: Array<EmbeddingOptions<{ inputType?: string }>> = []

  constructor(private behavior: MockAdapterBehavior = {}) {
    super('mock-embed', {})
  }

  createEmbeddings(
    options: EmbeddingOptions<{ inputType?: string }>,
  ): Promise<EmbeddingResult> {
    this.calls.push(options)
    if (this.behavior.error) return Promise.reject(this.behavior.error)
    const dimensions = this.behavior.dimensions ?? options.dimensions ?? 4
    const result: EmbeddingResult = {
      id: 'mock-1',
      model: options.model,
      embeddings: options.input.map((_, index) => ({
        vector: Array.from({ length: dimensions }, () => index + 0.5),
        index,
      })),
    }
    if (this.behavior.usage) result.usage = this.behavior.usage
    return Promise.resolve(result)
  }
}

// ============================================================================
// embed() runtime behavior
// ============================================================================

describe('embed()', () => {
  it('normalizes a single string input to an array for the adapter', async () => {
    const adapter = new MockEmbeddingAdapter()
    const result = await embed({ adapter, input: 'hello world' })

    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]!.input).toEqual(['hello world'])
    expect(result.embeddings).toHaveLength(1)
    expect(result.embeddings[0]!.index).toBe(0)
    expect(result.embeddings[0]!.vector).toHaveLength(4)
  })

  it('normalizes a single non-string item to an array', async () => {
    const adapter = new MockEmbeddingAdapter()
    await embed({
      adapter,
      input: { type: 'text', content: 'hello' },
    })

    expect(adapter.calls[0]!.input).toEqual([
      { type: 'text', content: 'hello' },
    ])
  })

  it('passes batch input through in order with matching indices', async () => {
    const adapter = new MockEmbeddingAdapter()
    const result = await embed({
      adapter,
      input: ['one', 'two', 'three'],
    })

    expect(adapter.calls[0]!.input).toEqual(['one', 'two', 'three'])
    expect(result.embeddings.map((e) => e.index)).toEqual([0, 1, 2])
  })

  it('threads dimensions and modelOptions to the adapter', async () => {
    const adapter = new MockEmbeddingAdapter()
    await embed({
      adapter,
      input: 'hello',
      dimensions: 256,
      modelOptions: { inputType: 'search_document' },
    })

    expect(adapter.calls[0]!.dimensions).toBe(256)
    expect(adapter.calls[0]!.modelOptions).toEqual({
      inputType: 'search_document',
    })
    expect(adapter.calls[0]!.model).toBe('mock-embed')
  })

  it('returns the adapter result with usage', async () => {
    const usage: TokenUsage = {
      promptTokens: 12,
      completionTokens: 0,
      totalTokens: 12,
    }
    const adapter = new MockEmbeddingAdapter({ usage })
    const result = await embed({ adapter, input: ['a', 'b'] })

    expect(result.usage).toEqual(usage)
    expect(result.model).toBe('mock-embed')
  })

  it('rethrows adapter errors', async () => {
    const adapter = new MockEmbeddingAdapter({ error: new Error('boom') })
    await expect(embed({ adapter, input: 'x' })).rejects.toThrow('boom')
  })

  // ==========================================================================
  // Middleware lifecycle
  // ==========================================================================

  describe('middleware', () => {
    it('calls onStart, onUsage, and onFinish in order on success', async () => {
      const order: Array<string> = []
      const middleware: GenerationMiddleware = {
        name: 'test',
        onStart: vi.fn(async () => {
          order.push('start')
        }),
        onUsage: vi.fn(async () => {
          order.push('usage')
        }),
        onFinish: vi.fn(async () => {
          order.push('finish')
        }),
        onError: vi.fn(),
      }
      const usage: TokenUsage = {
        promptTokens: 3,
        completionTokens: 0,
        totalTokens: 3,
      }
      const adapter = new MockEmbeddingAdapter({ usage })

      await embed({ adapter, input: 'hello', middleware: [middleware] })

      expect(order).toEqual(['start', 'usage', 'finish'])
      expect(middleware.onError).not.toHaveBeenCalled()
      const finishInfo = vi.mocked(middleware.onFinish!).mock.calls[0]![1]
      expect(finishInfo.usage).toEqual(usage)
      expect(typeof finishInfo.duration).toBe('number')
    })

    it('skips onUsage when the adapter reports no usage', async () => {
      const middleware: GenerationMiddleware = {
        name: 'test',
        onUsage: vi.fn(),
        onFinish: vi.fn(),
      }
      const adapter = new MockEmbeddingAdapter()

      await embed({ adapter, input: 'hello', middleware: [middleware] })

      expect(middleware.onUsage).not.toHaveBeenCalled()
      expect(middleware.onFinish).toHaveBeenCalledOnce()
    })

    it('calls onError (not onFinish) when the adapter throws', async () => {
      const middleware: GenerationMiddleware = {
        name: 'test',
        onStart: vi.fn(),
        onFinish: vi.fn(),
        onError: vi.fn(),
      }
      const adapter = new MockEmbeddingAdapter({ error: new Error('boom') })

      await expect(
        embed({ adapter, input: 'x', middleware: [middleware] }),
      ).rejects.toThrow('boom')

      expect(middleware.onStart).toHaveBeenCalledOnce()
      expect(middleware.onFinish).not.toHaveBeenCalled()
      expect(middleware.onError).toHaveBeenCalledOnce()
      const errorInfo = vi.mocked(middleware.onError!).mock.calls[0]![1]
      expect((errorInfo.error as Error).message).toBe('boom')
    })

    it('exposes an embedding activity context to hooks', async () => {
      const onStart = vi.fn()
      const adapter = new MockEmbeddingAdapter()

      await embed({
        adapter,
        input: 'hello',
        middleware: [{ name: 'ctx', onStart }],
      })

      const ctx = onStart.mock.calls[0]![0]
      expect(ctx.activity).toBe('embedding')
      expect(ctx.provider).toBe('mock')
      expect(ctx.model).toBe('mock-embed')
    })
  })
})

// ============================================================================
// Input resolution utilities
// ============================================================================

describe('embedding input utilities', () => {
  const image: EmbeddingInputItem = {
    type: 'image',
    source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
  }
  const fused: EmbeddingInputItem = [
    { type: 'text', content: 'caption' },
    {
      type: 'image',
      source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
    },
  ]

  describe('resolveEmbeddingInput', () => {
    it('resolves strings, text parts, image parts, and fused items in order', () => {
      const resolved = resolveEmbeddingInput([
        'plain',
        { type: 'text', content: 'part' },
        image,
        fused,
      ])

      expect(resolved).toHaveLength(4)
      expect(resolved[0]).toEqual({ texts: ['plain'], images: [] })
      expect(resolved[1]).toEqual({ texts: ['part'], images: [] })
      expect(resolved[2]!.texts).toEqual([])
      expect(resolved[2]!.images).toHaveLength(1)
      expect(resolved[3]!.texts).toEqual(['caption'])
      expect(resolved[3]!.images).toHaveLength(1)
    })

    const textPart: TextPart = { type: 'text', content: 'caption' }
    const imagePart: ImagePart = {
      type: 'image',
      source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
    }

    it('treats a top-level array of parts as separate items (one vector each)', () => {
      const resolved = resolveEmbeddingInput([textPart, imagePart])

      expect(resolved).toHaveLength(2)
      expect(resolved[0]).toEqual({ texts: ['caption'], images: [] })
      expect(resolved[1]!.texts).toEqual([])
      expect(resolved[1]!.images).toHaveLength(1)
    })

    it('fuses a nested array of parts into a single item (one vector)', () => {
      const resolved = resolveEmbeddingInput([[textPart, imagePart]])

      expect(resolved).toHaveLength(1)
      expect(resolved[0]!.texts).toEqual(['caption'])
      expect(resolved[0]!.images).toHaveLength(1)
    })
  })

  describe('requireTextOnlyEmbeddingInput', () => {
    it('returns plain texts for text-only input', () => {
      expect(
        requireTextOnlyEmbeddingInput(
          ['a', { type: 'text', content: 'b' }],
          'mock',
          'mock-embed',
        ),
      ).toEqual(['a', 'b'])
    })

    it('throws a clear error naming the offending index for image input', () => {
      expect(() =>
        requireTextOnlyEmbeddingInput(['a', image], 'mock', 'mock-embed'),
      ).toThrow(
        'mock model "mock-embed" only supports text embedding inputs; input item at index 1 contains an image part',
      )
    })
  })

  describe('countEmbeddingInputModalities', () => {
    it('counts text-only and image-carrying items', () => {
      expect(countEmbeddingInputModalities(['a', image, fused])).toEqual({
        textInputCount: 1,
        imageInputCount: 2,
      })
    })
  })
})
