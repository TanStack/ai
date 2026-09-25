import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  BedrockEmbeddingAdapter,
  bedrockEmbedding,
  createBedrockEmbedding,
} from '../src/adapters/embedding'
import type { BedrockEmbeddingModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

/**
 * Subclass that overrides the protected `invokeModel` SDK seam so no real
 * AWS call happens — the same stub pattern as the Converse adapter tests.
 * Bodies are captured per call; canned responses are keyed by call index.
 * An optional per-call delay lets tests force out-of-order completion to
 * prove result order tracks input order.
 */
class StubAdapter<
  TModel extends BedrockEmbeddingModel,
> extends BedrockEmbeddingAdapter<TModel> {
  bodies: Array<Record<string, unknown>> = []
  modelIds: Array<string> = []
  responses: Array<unknown> = []
  delaysMs: Array<number> = []

  protected override async invokeModel(
    modelId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const call = this.bodies.length
    this.bodies.push(body)
    this.modelIds.push(modelId)
    const delay = this.delaysMs[call]
    if (delay !== undefined && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    return this.responses[call]
  }
}

function titanResponse(embedding: Array<number>, inputTextTokenCount?: number) {
  return inputTextTokenCount === undefined
    ? { embedding }
    : { embedding, inputTextTokenCount }
}

describe('Bedrock Embedding Adapter', () => {
  describe('factories', () => {
    it('createBedrockEmbedding creates an adapter with the provided API key', () => {
      const adapter = createBedrockEmbedding(
        'amazon.titan-embed-text-v2:0',
        'test-api-key',
      )
      expect(adapter).toBeInstanceOf(BedrockEmbeddingAdapter)
      expect(adapter.kind).toBe('embedding')
      expect(adapter.name).toBe('bedrock')
      expect(adapter.model).toBe('amazon.titan-embed-text-v2:0')
    })

    it('bedrockEmbedding constructs without a key (auth resolves lazily)', () => {
      const adapter = bedrockEmbedding('cohere.embed-english-v3', {
        region: 'eu-west-1',
        auth: 'sigv4',
      })
      expect(adapter).toBeInstanceOf(BedrockEmbeddingAdapter)
      expect(adapter.model).toBe('cohere.embed-english-v3')
    })
  })

  describe('amazon.titan-embed-text-v2:0', () => {
    it('sends one InvokeModel call per text and sums usage', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-text-v2:0',
      )
      adapter.responses = [
        titanResponse([0.1, 0.2], 3),
        titanResponse([0.3, 0.4], 5),
        titanResponse([0.5, 0.6], 7),
      ]

      const result = await adapter.createEmbeddings({
        model: 'amazon.titan-embed-text-v2:0',
        input: ['one', { type: 'text', content: 'two' }, 'three'],
        logger: testLogger,
      })

      expect(adapter.bodies).toEqual([
        { inputText: 'one' },
        { inputText: 'two' },
        { inputText: 'three' },
      ])
      expect(adapter.modelIds).toEqual([
        'amazon.titan-embed-text-v2:0',
        'amazon.titan-embed-text-v2:0',
        'amazon.titan-embed-text-v2:0',
      ])
      expect(result.embeddings).toEqual([
        { vector: [0.1, 0.2], index: 0 },
        { vector: [0.3, 0.4], index: 1 },
        { vector: [0.5, 0.6], index: 2 },
      ])
      expect(result.usage).toEqual({
        promptTokens: 15,
        completionTokens: 0,
        totalTokens: 15,
      })
      expect(result.model).toBe('amazon.titan-embed-text-v2:0')
      expect(result.id).toContain('bedrock')
    })

    it('passes dimensions and normalize into each body', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-text-v2:0',
      )
      adapter.responses = [titanResponse([1], 1)]

      await adapter.createEmbeddings({
        model: 'amazon.titan-embed-text-v2:0',
        input: ['hello'],
        dimensions: 512,
        modelOptions: { normalize: true },
        logger: testLogger,
      })

      expect(adapter.bodies).toEqual([
        { inputText: 'hello', dimensions: 512, normalize: true },
      ])
    })

    it('rejects invalid dimensions without calling the SDK', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-text-v2:0',
      )
      await expect(
        adapter.createEmbeddings({
          model: 'amazon.titan-embed-text-v2:0',
          input: ['hello'],
          dimensions: 300,
          logger: testLogger,
        }),
      ).rejects.toThrow('supports dimensions 256, 512, or 1024; got 300')
      expect(adapter.bodies).toHaveLength(0)
    })

    it('rejects image input with a clear error', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-text-v2:0',
      )
      await expect(
        adapter.createEmbeddings({
          model: 'amazon.titan-embed-text-v2:0',
          input: [
            {
              type: 'image',
              source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow('only supports text embedding inputs')
      expect(adapter.bodies).toHaveLength(0)
    })

    it('preserves input order even when earlier calls finish later', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-text-v2:0',
      )
      adapter.responses = [
        titanResponse([0], 1),
        titanResponse([1], 1),
        titanResponse([2], 1),
      ]
      // First call resolves last.
      adapter.delaysMs = [30, 10, 0]

      const result = await adapter.createEmbeddings({
        model: 'amazon.titan-embed-text-v2:0',
        input: ['a', 'b', 'c'],
        logger: testLogger,
      })

      expect(result.embeddings).toEqual([
        { vector: [0], index: 0 },
        { vector: [1], index: 1 },
        { vector: [2], index: 2 },
      ])
    })
  })

  describe('amazon.titan-embed-image-v1', () => {
    it('maps a fused text+image item into one body (single vector)', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-image-v1',
      )
      adapter.responses = [titanResponse([0.9], 4)]

      const result = await adapter.createEmbeddings({
        model: 'amazon.titan-embed-image-v1',
        input: [
          [
            { type: 'text', content: 'a red guitar' },
            { type: 'text', content: 'product photo' },
            {
              type: 'image',
              source: {
                type: 'data',
                value: 'QkFTRTY0',
                mimeType: 'image/png',
              },
            },
          ],
        ],
        logger: testLogger,
      })

      expect(adapter.bodies).toEqual([
        {
          embeddingConfig: { outputEmbeddingLength: 1024 },
          inputText: 'a red guitar\nproduct photo',
          inputImage: 'QkFTRTY0',
        },
      ])
      expect(result.embeddings).toEqual([{ vector: [0.9], index: 0 }])
      expect(result.usage).toEqual({
        promptTokens: 4,
        completionTokens: 0,
        totalTokens: 4,
      })
    })

    it('strips the data: URI prefix from url sources', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-image-v1',
      )
      adapter.responses = [titanResponse([1])]

      await adapter.createEmbeddings({
        model: 'amazon.titan-embed-image-v1',
        input: [
          {
            type: 'image',
            source: { type: 'url', value: 'data:image/png;base64,QUJD' },
          },
        ],
        logger: testLogger,
      })

      expect(adapter.bodies).toEqual([
        {
          embeddingConfig: { outputEmbeddingLength: 1024 },
          inputImage: 'QUJD',
        },
      ])
    })

    it('rejects http(s) image URLs with a clear error', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-image-v1',
      )
      await expect(
        adapter.createEmbeddings({
          model: 'amazon.titan-embed-image-v1',
          input: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/cat.png' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(
        'Bedrock Titan does not fetch remote image URLs; pass base64 data',
      )
      expect(adapter.bodies).toHaveLength(0)
    })

    it('rejects multiple images in one fused item', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-image-v1',
      )
      await expect(
        adapter.createEmbeddings({
          model: 'amazon.titan-embed-image-v1',
          input: [
            [
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'QQ==',
                  mimeType: 'image/png',
                },
              },
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'Qg==',
                  mimeType: 'image/png',
                },
              },
            ],
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow('at most one image per input item')
    })

    it('maps dimensions onto embeddingConfig.outputEmbeddingLength and validates it', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'amazon.titan-embed-image-v1',
      )
      adapter.responses = [titanResponse([1])]

      await adapter.createEmbeddings({
        model: 'amazon.titan-embed-image-v1',
        input: ['caption only'],
        dimensions: 384,
        logger: testLogger,
      })
      expect(adapter.bodies).toEqual([
        {
          embeddingConfig: { outputEmbeddingLength: 384 },
          inputText: 'caption only',
        },
      ])

      await expect(
        adapter.createEmbeddings({
          model: 'amazon.titan-embed-image-v1',
          input: ['caption only'],
          dimensions: 512,
          logger: testLogger,
        }),
      ).rejects.toThrow('supports dimensions 256, 384, or 1024; got 512')
    })
  })

  describe('cohere.embed-*-v3', () => {
    it('sends one batched body with required input_type and optional truncate', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'cohere.embed-english-v3',
      )
      adapter.responses = [{ embeddings: [[0.1], [0.2], [0.3]] }]

      const result = await adapter.createEmbeddings({
        model: 'cohere.embed-english-v3',
        input: ['one', 'two', 'three'],
        modelOptions: { inputType: 'search_query', truncate: 'END' },
        logger: testLogger,
      })

      expect(adapter.bodies).toEqual([
        {
          texts: ['one', 'two', 'three'],
          input_type: 'search_query',
          truncate: 'END',
        },
      ])
      expect(result.embeddings).toEqual([
        { vector: [0.1], index: 0 },
        { vector: [0.2], index: 1 },
        { vector: [0.3], index: 2 },
      ])
      expect(result.usage).toBeUndefined()
    })

    it('chunks more than 96 texts into multiple calls, preserving order', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'cohere.embed-multilingual-v3',
      )
      const texts = Array.from({ length: 100 }, (_, i) => `text-${i}`)
      adapter.responses = [
        { embeddings: Array.from({ length: 96 }, (_, i) => [i]) },
        { embeddings: Array.from({ length: 4 }, (_, i) => [96 + i]) },
      ]

      const result = await adapter.createEmbeddings({
        model: 'cohere.embed-multilingual-v3',
        input: texts,
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(adapter.bodies).toHaveLength(2)
      expect(adapter.bodies[0]).toEqual({
        texts: texts.slice(0, 96),
        input_type: 'search_document',
      })
      expect(adapter.bodies[1]).toEqual({
        texts: texts.slice(96),
        input_type: 'search_document',
      })
      expect(result.embeddings).toHaveLength(100)
      expect(result.embeddings[0]).toEqual({ vector: [0], index: 0 })
      expect(result.embeddings[95]).toEqual({ vector: [95], index: 95 })
      expect(result.embeddings[96]).toEqual({ vector: [96], index: 96 })
      expect(result.embeddings[99]).toEqual({ vector: [99], index: 99 })
    })

    it('rejects the dimensions option (fixed output size)', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'cohere.embed-english-v3',
      )
      await expect(
        adapter.createEmbeddings({
          model: 'cohere.embed-english-v3',
          input: ['hello'],
          dimensions: 256,
          modelOptions: { inputType: 'search_query' },
          logger: testLogger,
        }),
      ).rejects.toThrow('does not support the dimensions option')
      expect(adapter.bodies).toHaveLength(0)
    })

    it('rejects a missing inputType at runtime (untyped callers)', async () => {
      const adapter = new StubAdapter(
        { apiKey: 'k' },
        'cohere.embed-english-v3',
      )
      await expect(
        adapter.createEmbeddings({
          model: 'cohere.embed-english-v3',
          input: ['hello'],
          logger: testLogger,
        }),
      ).rejects.toThrow('requires modelOptions.inputType')
      expect(adapter.bodies).toHaveLength(0)
    })
  })
})
