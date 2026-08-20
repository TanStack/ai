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
  it('rejects a foreign provider file reference in core preflight, before any request', async () => {
    await expect(
      collectChunks(
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
                    reference: { openai: 'file-openai-abc' },
                  },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(/byteplus does not support provider file-handle/)
  })

  it('rejects a byteplus-keyed file source — the provider has no Files API', async () => {
    await expect(
      collectChunks(
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
                    reference: { byteplus: 'https://example.com/some-handle' },
                  },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(/byteplus does not support provider file-handle/)
  })
})
