import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  CohereEmbeddingAdapter,
  cohereEmbedding,
  createCohereEmbedding,
} from '../src/adapters/embedding'

const testLogger = resolveDebugOption(false)

const EMBED_URL = 'https://api.cohere.com/v2/embed'

interface CohereEmbedResponseInit {
  vectors: Array<Array<number>>
  inputTokens?: number
}

function embedResponse({
  vectors,
  inputTokens,
}: CohereEmbedResponseInit): Response {
  return new Response(
    JSON.stringify({
      id: 'cohere-test-id',
      embeddings: { float: vectors },
      ...(inputTokens !== undefined
        ? { meta: { billed_units: { input_tokens: inputTokens } } }
        : {}),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function lastRequestBody(): any {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return JSON.parse(call[1].body)
}

function nthCall(index: number): [any, any] {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error('fetch was not called')
  return [call[0], call[1]]
}

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Cohere Embedding Adapter', () => {
  describe('createCohereEmbedding', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createCohereEmbedding('embed-v4.0', 'test-api-key')
      expect(adapter).toBeInstanceOf(CohereEmbeddingAdapter)
      expect(adapter.kind).toBe('embedding')
      expect(adapter.name).toBe('cohere')
      expect(adapter.model).toBe('embed-v4.0')
    })
  })

  describe('cohereEmbedding', () => {
    it('reads the API key from COHERE_API_KEY', () => {
      vi.stubEnv('COHERE_API_KEY', 'env-api-key')
      const adapter = cohereEmbedding('embed-v4.0')
      expect(adapter).toBeInstanceOf(CohereEmbeddingAdapter)
      expect(adapter.model).toBe('embed-v4.0')
    })

    it('throws when COHERE_API_KEY is not set', () => {
      vi.stubEnv('COHERE_API_KEY', '')
      expect(() => cohereEmbedding('embed-v4.0')).toThrow('COHERE_API_KEY')
    })
  })

  describe('createEmbeddings', () => {
    it('sends texts as a batch with auth headers and maps the response', async () => {
      fetchMock.mockResolvedValue(
        embedResponse({
          vectors: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
          inputTokens: 7,
        }),
      )
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      const result = await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = nthCall(0)
      expect(url).toBe(EMBED_URL)
      expect(init.method).toBe('POST')
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      })

      expect(lastRequestBody()).toEqual({
        model: 'embed-v4.0',
        inputs: [
          { content: [{ type: 'text', text: 'a red guitar' }] },
          { content: [{ type: 'text', text: 'a blue drum kit' }] },
        ],
        input_type: 'search_document',
        embedding_types: ['float'],
      })

      expect(result.embeddings).toEqual([
        { vector: [0.1, 0.2], index: 0 },
        { vector: [0.3, 0.4], index: 1 },
      ])
      expect(result.usage).toEqual({
        promptTokens: 7,
        completionTokens: 0,
        totalTokens: 7,
      })
      expect(result.model).toBe('embed-v4.0')
    })

    it('honors baseUrl and custom headers', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key', {
        baseUrl: 'https://proxy.example.com',
        headers: { 'X-Custom': 'yes' },
      })

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['hello'],
        modelOptions: { inputType: 'search_query' },
        logger: testLogger,
      })

      const [url, init] = nthCall(0)
      expect(url).toBe('https://proxy.example.com/v2/embed')
      expect(init.headers).toMatchObject({ 'X-Custom': 'yes' })
    })

    it('maps a data-source image to a data: URI content part', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.5]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: [
          {
            type: 'image',
            source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
          },
        ],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(lastRequestBody().inputs).toEqual([
        {
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGk=' },
            },
          ],
        },
      ])
    })

    it('passes url-source data: URIs through unchanged', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.5]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: [
          {
            type: 'image',
            source: { type: 'url', value: 'data:image/jpeg;base64,aGk=' },
          },
        ],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(lastRequestBody().inputs[0].content[0].image_url.url).toBe(
        'data:image/jpeg;base64,aGk=',
      )
    })

    it('sends a fused text+image item as one content array (one vector)', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.9]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      const result = await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: [
          {
            type: 'content',
            content: [
              { type: 'text', content: 'product photo' },
              {
                type: 'image',
                source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
              },
            ],
          },
        ],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(lastRequestBody().inputs).toEqual([
        {
          content: [
            { type: 'text', text: 'product photo' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGk=' },
            },
          ],
        },
      ])
      expect(result.embeddings).toEqual([{ vector: [0.9], index: 0 }])
    })

    it('maps inputType, truncate, and dimensions onto the request body', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['hello'],
        dimensions: 1024,
        modelOptions: { inputType: 'clustering', truncate: 'END' },
        logger: testLogger,
      })

      const body = lastRequestBody()
      expect(body.input_type).toBe('clustering')
      expect(body.truncate).toBe('END')
      expect(body.output_dimension).toBe(1024)
    })

    it('omits truncate and output_dimension when not provided', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['hello'],
        modelOptions: { inputType: 'search_query' },
        logger: testLogger,
      })

      const body = lastRequestBody()
      expect('truncate' in body).toBe(false)
      expect('output_dimension' in body).toBe(false)
    })

    it('always pins embedding_types to ["float"]', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['hello'],
        modelOptions: {
          inputType: 'search_document',
          embeddingTypes: ['float'],
        },
        logger: testLogger,
      })

      expect(lastRequestBody().embedding_types).toEqual(['float'])
    })

    it('throws when modelOptions.inputType is missing', async () => {
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await expect(
        adapter.createEmbeddings({
          model: 'embed-v4.0',
          input: ['hello'],
          logger: testLogger,
        }),
      ).rejects.toThrow('modelOptions.inputType')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects http(s) image URLs by default', async () => {
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await expect(
        adapter.createEmbeddings({
          model: 'embed-v4.0',
          input: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/cat.png' },
            },
          ],
          modelOptions: { inputType: 'search_document' },
          logger: testLogger,
        }),
      ).rejects.toThrow('Cohere does not fetch remote image URLs')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('downloads http(s) image URLs when allowUrlFetch is enabled', async () => {
      const imageUrl = 'https://example.com/cat.png'
      // "Hello" → base64 "SGVsbG8="
      const imageBytes = new Uint8Array([72, 101, 108, 108, 111])
      fetchMock.mockImplementation((url: unknown) => {
        if (url === imageUrl) {
          return Promise.resolve(
            new Response(imageBytes, {
              status: 200,
              headers: { 'content-type': 'image/png' },
            }),
          )
        }
        return Promise.resolve(embedResponse({ vectors: [[0.7]] }))
      })
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key', {
        allowUrlFetch: true,
      })

      const result = await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: [{ type: 'image', source: { type: 'url', value: imageUrl } }],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledWith(
        imageUrl,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
      expect(lastRequestBody().inputs[0].content[0].image_url.url).toBe(
        'data:image/png;base64,SGVsbG8=',
      )
      expect(result.embeddings).toEqual([{ vector: [0.7], index: 0 }])
    })

    it('rejects private/loopback image URLs even when allowUrlFetch is enabled', async () => {
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key', {
        allowUrlFetch: true,
      })

      for (const value of [
        'http://127.0.0.1/secret.png',
        'http://localhost/secret.png',
        'http://169.254.169.254/latest/meta-data/',
        'http://192.168.1.1/img.png',
        'http://10.0.0.5/img.png',
        'http://172.16.0.1/img.png',
      ]) {
        await expect(
          adapter.createEmbeddings({
            model: 'embed-v4.0',
            input: [{ type: 'image', source: { type: 'url', value } }],
            modelOptions: { inputType: 'search_document' },
            logger: testLogger,
          }),
        ).rejects.toThrow('Refusing to fetch internal or private URL')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('passes an AbortSignal on the Cohere API fetch', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['hello'],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      const [, init] = nthCall(0)
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('omits usage when billed_units.input_tokens is absent', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      const result = await adapter.createEmbeddings({
        model: 'embed-v4.0',
        input: ['hello'],
        modelOptions: { inputType: 'search_document' },
        logger: testLogger,
      })

      expect(result.usage).toBeUndefined()
    })

    it('throws when the embedding count does not match the input count', async () => {
      fetchMock.mockResolvedValue(embedResponse({ vectors: [[0.1]] }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await expect(
        adapter.createEmbeddings({
          model: 'embed-v4.0',
          input: ['one', 'two'],
          modelOptions: { inputType: 'search_document' },
          logger: testLogger,
        }),
      ).rejects.toThrow('returned 1 embeddings for 2 inputs')
    })

    it('throws a clear error with the API message on non-2xx responses', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: 'invalid api token' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      const adapter = createCohereEmbedding('embed-v4.0', 'bad-key')

      await expect(
        adapter.createEmbeddings({
          model: 'embed-v4.0',
          input: ['hello'],
          modelOptions: { inputType: 'search_document' },
          logger: testLogger,
        }),
      ).rejects.toThrow('Cohere embed failed (401): invalid api token')
    })

    it('falls back to the raw body text for non-JSON error responses', async () => {
      fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
      const adapter = createCohereEmbedding('embed-v4.0', 'test-key')

      await expect(
        adapter.createEmbeddings({
          model: 'embed-v4.0',
          input: ['hello'],
          modelOptions: { inputType: 'search_document' },
          logger: testLogger,
        }),
      ).rejects.toThrow('Cohere embed failed (502): Bad Gateway')
    })
  })
})
