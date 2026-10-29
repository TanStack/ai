import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createNeonEmbedding } from '../src/adapters/embedding'
import { createNeonSummarize } from '../src/adapters/summarize'

const logger = resolveDebugOption(false)
const HOST = 'https://br-test-api.ai.c-1.us-east-2.aws.neon.tech'

describe('neon embedding adapter', () => {
  it('posts to /v1/embeddings and returns the vectors', async () => {
    const sent: Array<{ url: string; body: any }> = []
    const adapter = createNeonEmbedding('qwen3-embedding-0-6b', 'nt-test', {
      baseURL: HOST,
      fetch: async (input, init) => {
        sent.push({
          url: new Request(input).url,
          body: JSON.parse(String(init?.body)),
        })
        return Response.json({
          object: 'list',
          data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
          model: 'qwen3-embedding-0-6b',
          usage: { prompt_tokens: 3, total_tokens: 3 },
        })
      },
    })

    const result = await adapter.createEmbeddings({
      model: 'qwen3-embedding-0-6b',
      input: ['a red guitar'],
      dimensions: 1024,
      logger,
    })

    expect(result.embeddings[0]?.vector).toEqual([0.1, 0.2])
    expect(sent[0]?.url).toBe(`${HOST}/v1/embeddings`)
    expect(sent[0]?.body).toMatchObject({
      model: 'qwen3-embedding-0-6b',
      input: ['a red guitar'],
      dimensions: 1024,
    })
  })
})

describe('neon summarize adapter', () => {
  /** Runs one summarize call and gives back the request body. */
  async function summarizeBody(
    model: Parameters<typeof createNeonSummarize>[0],
  ) {
    const bodies: Array<any> = []
    const adapter = createNeonSummarize(model, 'nt-test', {
      baseURL: HOST,
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response('', {
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })
    await adapter
      .summarize({
        model,
        threadId: 'thread-1',
        text: 'A long text.',
        maxLength: 50,
        logger,
      })
      .catch(() => {
        // An empty stream fails; only the request matters here.
      })
    return { adapter, body: bodies[0] }
  }

  it('caps output with max_tokens on Chat Completions', async () => {
    const { adapter, body } = await summarizeBody('gpt-5-4')
    expect(adapter.name).toBe('neon')
    expect(body.max_tokens).toBeGreaterThan(0)
    expect(body.temperature).toBe(0.3)
  })

  it('uses Responses token options for an explicit Responses route', async () => {
    const bodies: Array<any> = []
    const adapter = createNeonSummarize('gpt-6-1-sol', 'nt-test', {
      api: 'responses',
      baseURL: HOST,
      fetch: async (input, init) => {
        expect(new Request(input).url).toBe(`${HOST}/openai/v1/responses`)
        bodies.push(JSON.parse(String(init?.body)))
        return new Response('', {
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })
    await adapter.summarize({
      model: 'gpt-6-1-sol',
      threadId: 'thread-1',
      text: 'A long text.',
      maxLength: 50,
      logger,
      modelOptions: { max_output_tokens: 100 },
    })
    await adapter.summarize({
      model: 'gpt-6-1-sol',
      threadId: 'thread-1',
      text: 'A long text.',
      maxLength: 50,
      logger,
    })
    expect(bodies.map((body) => body.max_output_tokens)).toEqual([100, 50])
    for (const body of bodies) {
      expect(body).not.toHaveProperty('max_tokens')
      expect(body).not.toHaveProperty('temperature')
    }
  })

  it('drops the default temperature for a model that rejects it', async () => {
    const { body } = await summarizeBody('gpt-5-5')
    expect(body).not.toHaveProperty('temperature')
  })

  it('runs Claude on the Anthropic adapter', async () => {
    const { adapter, body } = await summarizeBody('claude-sonnet-5-5')
    expect(adapter.name).toBe('anthropic')
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('omits the default temperature for Claude models that reject sampling', async () => {
    const { body } = await summarizeBody('claude-opus-5-5')
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
  })
})
