import { expect, it, vi } from 'vitest'
import { createVercelGatewayEmbedding } from '../src/adapters/embedding'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'

const testLogger = resolveDebugOption(false)

it('embeds text through the OpenAI embeddings client', async () => {
  const adapter = createVercelGatewayEmbedding(
    'openai/text-embedding-3-small',
    'k',
  )
  const create = vi.fn().mockResolvedValue({
    data: [{ embedding: [0.1, 0.2], index: 0 }],
    usage: { prompt_tokens: 3, total_tokens: 3 },
  })
  ;(adapter as any).client = {
    embeddings: { create },
  }

  const result = await adapter.createEmbeddings({
    model: 'openai/text-embedding-3-small',
    input: ['a red guitar'],
    logger: testLogger,
    modelOptions: { gateway: { only: ['openai'] } },
  })

  expect(result.embeddings[0]?.vector).toEqual([0.1, 0.2])
  const body = create.mock.calls[0]![0] as Record<string, unknown>
  expect(body.model).toBe('openai/text-embedding-3-small')
  expect(body.encoding_format).toBe('float')
  expect(body.providerOptions).toEqual({ gateway: { only: ['openai'] } })
  expect(body).not.toHaveProperty('gateway')
})

it('rejects image input', async () => {
  const adapter = createVercelGatewayEmbedding(
    'openai/text-embedding-3-small',
    'k',
  )
  await expect(
    adapter.createEmbeddings({
      model: 'openai/text-embedding-3-small',
      input: [
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/a.png' },
        },
      ],
      logger: testLogger,
    }),
  ).rejects.toThrow()
})
