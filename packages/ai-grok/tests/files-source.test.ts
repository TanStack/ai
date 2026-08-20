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

// Grok's text adapter inherits the openai-base Responses mapping, which knows
// how to emit `file_id` — but xAI has no Files API, so the base's
// `supportsFileIdInput` gate must reject file sources here instead of
// forwarding a file_id xAI can't resolve. The mocked `create` exists only to
// fail loudly if a file source ever leaks into a network call.
function adapterWithMockClient() {
  const adapter = createGrokText(GROK_CHAT_MODELS[0], 'test-key')
  ;(adapter as any).client = { responses: { create: vi.fn() } }
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

function fileSourceMessage(provider: string) {
  return [
    {
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          source: { type: 'file' as const, value: 'file-abc', provider },
        },
      ],
    },
  ]
}

describe('grok file content source', () => {
  it('rejects an openai file handle instead of forwarding its file_id', async () => {
    const chunks = await collectChunks(
      chat({
        adapter: adapterWithMockClient(),
        messages: fileSourceMessage('openai'),
      }),
    )

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toMatch(/grok/)
      expect(runError.message).toMatch(/file/)
    }
  })

  it('rejects even a grok-marked file source — xAI has no Files API', async () => {
    const chunks = await collectChunks(
      chat({
        adapter: adapterWithMockClient(),
        messages: fileSourceMessage('grok'),
      }),
    )

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toMatch(/does not support provider file-handle/)
    }
  })
})
