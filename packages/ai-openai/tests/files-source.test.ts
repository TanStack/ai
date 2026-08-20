import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { OpenAITextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

function mockResponsesStream(): AsyncIterable<Record<string, unknown>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'response.created',
        response: { id: 'r1', model: 'gpt-4o-mini', status: 'in_progress' },
      }
      yield {
        type: 'response.completed',
        response: {
          id: 'r1',
          model: 'gpt-4o-mini',
          status: 'completed',
          output: [],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      }
    },
  }
}

function withMockClient(create: ReturnType<typeof vi.fn>) {
  const adapter = new OpenAITextAdapter({ apiKey: 'k' }, 'gpt-4o-mini')
  ;(adapter as unknown as { client: unknown }).client = {
    responses: { create },
  }
  return adapter
}

async function drain(iterable: AsyncIterable<unknown>) {
  for await (const _ of iterable) {
    // consume
  }
}

describe('openai file content source', () => {
  it('maps an openai file handle to input_image.file_id on the Responses API', async () => {
    const create = vi.fn().mockResolvedValueOnce(mockResponsesStream())
    const adapter = withMockClient(create)

    await drain(
      chat({
        adapter,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'look' },
              {
                type: 'image',
                source: {
                  type: 'file',
                  value: 'file-openai-abc',
                  provider: 'openai',
                },
              },
            ],
          },
        ],
      }),
    )

    const [payload] = create.mock.calls[0]!
    const userItem = payload.input.find(
      (item: any) => item.type === 'message' && item.role === 'user',
    )
    const imageContent = userItem.content.find(
      (c: any) => c.type === 'input_image',
    )
    expect(imageContent.file_id).toBe('file-openai-abc')
    expect(imageContent.image_url).toBeUndefined()
  })

  it('errors when a foreign provider file handle reaches the openai adapter', async () => {
    const create = vi.fn().mockResolvedValueOnce(mockResponsesStream())
    const adapter = withMockClient(create)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'file',
                value: 'files/gemini-xyz',
                provider: 'gemini',
              },
            },
          ],
        },
      ],
    })) {
      chunks.push(chunk)
    }

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toMatch(/openai/)
    }
  })
})
