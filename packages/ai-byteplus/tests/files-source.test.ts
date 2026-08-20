import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { createBytePlusText } from '../src/adapters/text'
import { BYTEPLUS_CHAT_MODELS } from '../src/model-meta'
import type { StreamChunk } from '@tanstack/ai'

// Stub the OpenAI SDK so constructing an adapter never opens a real network
// handle (same pattern as text.test.ts).
vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn(),
        },
      }
    },
  }
})

// The guard throws while the request body is being built, so the mocked
// `create` is never reached — it exists only to fail loudly if a file source
// ever leaks through to a network call.
function adapterWithMockClient() {
  const adapter = createBytePlusText(BYTEPLUS_CHAT_MODELS[0], 'test-key')
  ;(adapter as any).client = { chat: { completions: { create: vi.fn() } } }
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

describe('byteplus file content source', () => {
  it('rejects a foreign provider file handle instead of sending it as a URL', async () => {
    const chunks = await collectChunks(
      chat({
        adapter: adapterWithMockClient(),
        messages: [
          {
            role: 'user',
            content: [
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

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toMatch(/byteplus/)
      expect(runError.message).toMatch(/file/)
    }
  })

  it('rejects a byteplus-marked file source — the provider has no Files API', async () => {
    const chunks = await collectChunks(
      chat({
        adapter: adapterWithMockClient(),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'video',
                source: {
                  type: 'file',
                  value: 'https://example.com/some-handle',
                  provider: 'byteplus',
                },
              },
            ],
          },
        ],
      }),
    )

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toMatch(/byteplus/)
    }
  })
})
