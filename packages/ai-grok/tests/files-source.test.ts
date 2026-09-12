import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { createGrokText } from '../src/adapters/text'
import { GROK_CHAT_MODELS } from '../src/model-meta'
import type { StreamChunk } from '@tanstack/ai'

vi.mock('openai', () => {
  return {
    default: class {
      responses = {
        create: vi.fn(),
      }
    },
  }
})

function mockResponsesStream(): AsyncIterable<Record<string, unknown>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'response.created',
        response: { id: 'r1', model: 'grok', status: 'in_progress' },
      }
      yield {
        type: 'response.completed',
        response: {
          id: 'r1',
          model: 'grok',
          status: 'completed',
          output: [],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      }
    },
  }
}

// xAI accepts `file_id` only on `input_file`, and only on agentic-capable
// models, while its image path takes `image_url`. `grokFiles()` therefore
// hands out an xAI public URL as the wire reference, and the adapter routes
// it to the URL-shaped fields. These tests pin that mapping.
function adapterWithMockClient(create: ReturnType<typeof vi.fn>) {
  const adapter = createGrokText(GROK_CHAT_MODELS[0], 'test-key')
  ;(adapter as unknown as { client: unknown }).client = {
    responses: { create },
  }
  return adapter
}

async function collectChunks(
  iterable: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

const PUBLIC_URL = 'https://files-cdn.x.ai/tok/file_abc123.png'

function fileSourceMessage(provider: string, type: 'image' | 'document') {
  return [
    {
      role: 'user' as const,
      content: [
        {
          type,
          source: {
            type: 'file' as const,
            reference: { [provider]: PUBLIC_URL },
          },
        },
      ],
    },
  ]
}

describe('grok file content source', () => {
  it('maps a grok handle to input_image.image_url, not file_id', async () => {
    const create = vi.fn().mockResolvedValueOnce(mockResponsesStream())
    await collectChunks(
      chat({
        adapter: adapterWithMockClient(create),
        messages: fileSourceMessage('grok', 'image'),
      }),
    )

    const [payload] = create.mock.calls[0]!
    const userItem = payload.input.find(
      (item: any) => item.type === 'message' && item.role === 'user',
    )
    const imageContent = userItem.content.find(
      (c: any) => c.type === 'input_image',
    )
    expect(imageContent.image_url).toBe(PUBLIC_URL)
    // xAI's image path has no file_id form.
    expect(imageContent.file_id).toBeUndefined()
  })

  it('maps a grok handle to input_file.file_url for documents', async () => {
    const create = vi.fn().mockResolvedValueOnce(mockResponsesStream())
    await collectChunks(
      chat({
        adapter: adapterWithMockClient(create),
        messages: fileSourceMessage('grok', 'document'),
      }),
    )

    const [payload] = create.mock.calls[0]!
    const userItem = payload.input.find(
      (item: any) => item.type === 'message' && item.role === 'user',
    )
    const fileContent = userItem.content.find(
      (c: any) => c.type === 'input_file',
    )
    expect(fileContent.file_url).toBe(PUBLIC_URL)
    // A public URL works on every chat model; file_id would not.
    expect(fileContent.file_id).toBeUndefined()
  })

  it('rejects an openai file reference — no grok entry in the record', async () => {
    const create = vi.fn()
    // The adapter declares support, so the lookup fails while the request is
    // being built and surfaces as a RUN_ERROR chunk rather than a preflight
    // throw. Either way no request reaches xAI.
    const chunks = await collectChunks(
      chat({
        adapter: adapterWithMockClient(create),
        messages: fileSourceMessage('openai', 'image'),
      }),
    )

    const runError = chunks.find((chunk) => chunk.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    expect((runError as { message?: string }).message).toMatch(
      /grok.*found: openai/s,
    )
    expect(create).not.toHaveBeenCalled()
  })
})
