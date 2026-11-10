import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rerank } from '@tanstack/ai'
import { BEDROCK_RERANK_MODELS, bedrockRerank } from '../src'

const { credentials, providerChain } = vi.hoisted(() => {
  const resolveCredentials = vi.fn()
  return {
    credentials: resolveCredentials,
    providerChain: vi.fn(() => resolveCredentials),
  }
})
vi.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: providerChain,
}))

const fetchMock = vi.fn<typeof fetch>()
const documents = ['sunny day at the beach', 'rainy afternoon in the city']
const results = [
  { index: 1, relevanceScore: 0.98 },
  { index: 0, relevanceScore: 0.12 },
]

function bedrockResponse(
  body: unknown = { results },
  requestId = 'aws-request-1',
) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...(requestId ? { 'x-amzn-requestid': requestId } : {}),
    },
  })
}

function requestBody(index = 0): unknown {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`Missing rerank request ${index}`)
  return JSON.parse(String(call[1]?.body))
}

function rerankOptions() {
  return {
    adapter: bedrockRerank('cohere.rerank-v3-5:0'),
    query: 'talk about rain',
    documents,
    debug: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset().mockImplementation(async () => bedrockResponse())
  credentials.mockReset().mockResolvedValue({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'test-secret',
    sessionToken: 'test-session',
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('BedrockRerankAdapter', () => {
  it('constructs without resolving AWS credentials', () => {
    const adapter = bedrockRerank('cohere.rerank-v3-5:0')
    expect(adapter).toMatchObject({
      name: 'bedrock',
      kind: 'rerank',
      model: 'cohere.rerank-v3-5:0',
    })
    expect(providerChain).not.toHaveBeenCalled()
    expect(credentials).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(BEDROCK_RERANK_MODELS)(
    'sends a signed rerank request for %s',
    async (model) => {
      await rerank({
        ...rerankOptions(),
        adapter: bedrockRerank(model, { region: 'us-west-2' }),
        topN: 1,
        modelOptions: {
          additionalModelRequestFields: { max_tokens_per_doc: 512 },
        },
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] ?? []
      expect(url).toBe(
        'https://bedrock-agent-runtime.us-west-2.amazonaws.com/rerank',
      )
      expect(init?.method).toBe('POST')
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toContain(
        'AWS4-HMAC-SHA256 Credential=AKIA_TEST/',
      )
      expect(headers.get('authorization')).toContain(
        '/us-west-2/bedrock/aws4_request',
      )
      expect(headers.get('x-amz-security-token')).toBe('test-session')
      expect(headers.get('content-type')).toBe('application/json')
      expect(requestBody()).toEqual({
        queries: [{ type: 'TEXT', textQuery: { text: 'talk about rain' } }],
        sources: [
          {
            type: 'INLINE',
            inlineDocumentSource: {
              type: 'TEXT',
              textDocument: { text: 'sunny day at the beach' },
            },
          },
          {
            type: 'INLINE',
            inlineDocumentSource: {
              type: 'TEXT',
              textDocument: { text: 'rainy afternoon in the city' },
            },
          },
        ],
        rerankingConfiguration: {
          type: 'BEDROCK_RERANKING_MODEL',
          bedrockRerankingConfiguration: {
            modelConfiguration: {
              modelArn: `arn:aws:bedrock:us-west-2::foundation-model/${model}`,
              additionalModelRequestFields: { max_tokens_per_doc: 512 },
            },
            numberOfResults: 1,
          },
        },
      })
    },
  )

  it('defaults to us-east-1 and explicitly requests every document', async () => {
    await rerank(rerankOptions())
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://bedrock-agent-runtime.us-east-1.amazonaws.com/rerank',
    )
    expect(requestBody()).toMatchObject({
      rerankingConfiguration: {
        bedrockRerankingConfiguration: {
          modelConfiguration: {
            modelArn:
              'arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0',
          },
          numberOfResults: 2,
        },
      },
    })
    expect(requestBody()).not.toHaveProperty(
      'rerankingConfiguration.bedrockRerankingConfiguration.modelConfiguration.additionalModelRequestFields',
    )
    expect(requestBody()).not.toHaveProperty('nextToken')
  })

  it.each(['BEDROCK_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK'])(
    'ignores %s and uses AWS credentials',
    async (variable) => {
      vi.stubEnv(variable, 'not-a-supported-rerank-key')
      await rerank(rerankOptions())
      expect(credentials).toHaveBeenCalledOnce()
      expect(
        new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization'),
      ).toMatch(/^AWS4-HMAC-SHA256 /)
    },
  )

  it('signs custom headers and transport with a normalized endpoint override', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(bedrockResponse())
    await rerank({
      ...rerankOptions(),
      adapter: bedrockRerank('cohere.rerank-v3-5:0', {
        baseURL: 'https://proxy.example/bedrock///',
        defaultHeaders: {
          'X-Gateway': 'test',
          Authorization: 'must-be-replaced',
        },
        fetch: transport,
      }),
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(transport.mock.calls[0]?.[0]).toBe(
      'https://proxy.example/bedrock/rerank',
    )
    const headers = new Headers(transport.mock.calls[0]?.[1]?.headers)
    expect(headers.get('x-gateway')).toBe('test')
    expect(headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /)
    expect(headers.get('authorization')).toContain('x-gateway')
  })

  it('maps scores and indices without claiming usage or mutating input', async () => {
    const result = await rerank(rerankOptions())
    expect(result).toEqual({
      id: 'aws-request-1',
      model: 'cohere.rerank-v3-5:0',
      ranking: [
        { index: 1, score: 0.98, document: documents[1] },
        { index: 0, score: 0.12, document: documents[0] },
      ],
      rerankedDocuments: [documents[1], documents[0]],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    })
    expect(documents).toEqual([
      'sunny day at the beach',
      'rainy afternoon in the city',
    ])
  })

  it('serializes object documents once and returns the originals', async () => {
    const objects = [
      { id: 1, text: 'sun' },
      { id: 2, text: 'rain' },
    ]
    const result = await rerank({ ...rerankOptions(), documents: objects })
    expect(requestBody()).toMatchObject({
      sources: [
        {
          inlineDocumentSource: {
            type: 'TEXT',
            textDocument: { text: '{"id":1,"text":"sun"}' },
          },
        },
        {
          inlineDocumentSource: {
            type: 'TEXT',
            textDocument: { text: '{"id":2,"text":"rain"}' },
          },
        },
      ],
    })
    expect(result.ranking[0]?.document).toBe(objects[1])
    expect(result.rerankedDocuments[1]).toBe(objects[0])
  })

  it('generates an id if AWS omits its request id', async () => {
    fetchMock.mockResolvedValue(bedrockResponse({ results }, ''))
    expect((await rerank(rerankOptions())).id).toMatch(/^bedrock-/)
  })

  it('collects pages in provider order using the same request and the first request id', async () => {
    fetchMock
      .mockResolvedValueOnce(
        bedrockResponse({ results: [results[0]], nextToken: 'page-2' }),
      )
      .mockResolvedValueOnce(
        bedrockResponse({ results: [results[1]] }, 'aws-request-2'),
      )
    const result = await rerank(rerankOptions())
    expect(result.id).toBe('aws-request-1')
    expect(result.rerankedDocuments).toEqual([documents[1], documents[0]])
    const secondBody = requestBody(1)
    if (
      typeof secondBody !== 'object' ||
      secondBody === null ||
      !('nextToken' in secondBody)
    ) {
      throw new Error('Missing continuation request body')
    }
    const { nextToken, ...initialBody } = secondBody
    expect(initialBody).toEqual(requestBody())
    expect(nextToken).toBe('page-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops at topN even when AWS returns a continuation token', async () => {
    fetchMock.mockResolvedValue(
      bedrockResponse({ results, nextToken: 'not-needed' }),
    )
    const result = await rerank({ ...rerankOptions(), topN: 1 })
    expect(result.ranking).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects repeated pagination tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(
        bedrockResponse({ results: [results[0]], nextToken: 'again' }),
      )
      .mockResolvedValueOnce(
        bedrockResponse({ results: [results[1]], nextToken: 'again' }),
      )
    await expect(rerank({ ...rerankOptions(), topN: 3 })).rejects.toThrow(
      'pagination did not advance',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects an empty continuation page', async () => {
    fetchMock.mockResolvedValue(
      bedrockResponse({ results: [], nextToken: 'again' }),
    )
    await expect(rerank(rerankOptions())).rejects.toThrow(
      'pagination did not advance',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('accepts 1000 documents and rejects 1001 before resolving credentials', async () => {
    await rerank({
      ...rerankOptions(),
      documents: Array.from({ length: 1000 }, () => 'text'),
    })
    expect(requestBody()).toMatchObject({
      rerankingConfiguration: {
        bedrockRerankingConfiguration: { numberOfResults: 1000 },
      },
    })
    vi.clearAllMocks()
    await expect(
      rerank({
        ...rerankOptions(),
        documents: Array.from({ length: 1001 }, () => 'text'),
      }),
    ).rejects.toThrow('between 1 and 1000 documents')
    expect(credentials).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets core reject an empty document list', async () => {
    await expect(rerank({ ...rerankOptions(), documents: [] })).rejects.toThrow(
      'at least one document',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, 1001, NaN, Infinity])(
    'rejects invalid topN %s',
    async (topN) => {
      await expect(rerank({ ...rerankOptions(), topN })).rejects.toThrow(
        'topN must be an integer between 1 and 1000',
      )
      expect(credentials).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    null,
    {},
    { results: 'bad' },
    { results: [null] },
    { results: [{ index: 0.5, relevanceScore: 0.5 }] },
    { results: [{ index: '0', relevanceScore: 0.5 }] },
    { results: [{ index: 0, relevanceScore: '0.5' }] },
    { results: [{ index: 0, relevanceScore: null }] },
    { results: [{ index: 0 }] },
    { results, nextToken: null },
    { results, nextToken: '' },
    { results, nextToken: 'has spaces' },
    { results, nextToken: 'x'.repeat(2049) },
  ])('rejects malformed response %#', async (body) => {
    fetchMock.mockResolvedValue(bedrockResponse(body))
    await expect(rerank(rerankOptions())).rejects.toThrow('unexpected shape')
  })

  it('rejects a non-finite JSON score', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"results":[{"index":0,"relevanceScore":1e400}]}'),
    )
    await expect(rerank(rerankOptions())).rejects.toThrow('unexpected shape')
  })

  it('propagates invalid JSON and lets core reject out-of-range indices', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json'))
    await expect(rerank(rerankOptions())).rejects.toBeInstanceOf(SyntaxError)
    fetchMock.mockResolvedValueOnce(
      bedrockResponse({ results: [{ index: 5, relevanceScore: 0.5 }] }),
    )
    await expect(rerank(rerankOptions())).rejects.toThrow(
      'out-of-range index 5',
    )
  })

  it.each([403, 429, 500])(
    'reports HTTP %s and AWS error detail without retrying',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('{"message":"AWS failure"}', { status }),
      )
      await expect(rerank(rerankOptions())).rejects.toThrow(
        new RegExp(`Bedrock rerank request failed: ${status} .*AWS failure`),
      )
      expect(fetchMock).toHaveBeenCalledOnce()
    },
  )

  it('propagates network and credential errors', async () => {
    const networkError = new Error('connection failed')
    fetchMock.mockRejectedValueOnce(networkError)
    await expect(rerank(rerankOptions())).rejects.toBe(networkError)
    fetchMock.mockClear()
    const credentialError = new Error('credentials unavailable')
    credentials.mockRejectedValueOnce(credentialError)
    await expect(rerank(rerankOptions())).rejects.toBe(credentialError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not request anything for an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      rerank({ ...rerankOptions(), abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(credentials).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards in-flight cancellation to fetch', async () => {
    const controller = new AbortController()
    const started = new Promise<void>((resolve) => {
      fetchMock.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(init.signal?.reason),
              { once: true },
            )
            resolve()
          }),
      )
    })
    const pending = rerank({
      ...rerankOptions(),
      abortSignal: controller.signal,
    })
    await started
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not fetch the next page after cancellation', async () => {
    const controller = new AbortController()
    const response = bedrockResponse({
      results: [results[0]],
      nextToken: 'page-2',
    })
    const readJson = response.json.bind(response)
    vi.spyOn(response, 'json').mockImplementation(async () => {
      const page: unknown = await readJson()
      controller.abort()
      return page
    })
    fetchMock.mockResolvedValue(response)
    await expect(
      rerank({ ...rerankOptions(), abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('passes the core timeout signal to the pending request', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    await expect(
      rerank({ ...rerankOptions(), timeout: 50 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
