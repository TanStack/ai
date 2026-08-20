import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { GeminiTextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const mocks = vi.hoisted(() => {
  return {
    generateContentStreamSpy: vi.fn(),
  }
})

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<any>('@google/genai')
  class MockGoogleGenAI {
    public models = {
      generateContentStream: mocks.generateContentStreamSpy,
    }

    constructor(_options: { apiKey: string }) {}
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: actual.Type,
    FinishReason: actual.FinishReason,
  }
})

const emptyStream = () =>
  (async function* () {
    yield {
      candidates: [
        { content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
      ],
      usageMetadata: {
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
      },
    }
  })()

async function collectChunks(
  iterable: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

describe('gemini file content source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps a gemini file handle to fileData.fileUri', async () => {
    mocks.generateContentStreamSpy.mockResolvedValueOnce(emptyStream())
    const adapter = new GeminiTextAdapter({ apiKey: 'k' }, 'gemini-2.5-pro')

    await collectChunks(
      chat({
        adapter,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'describe' },
              {
                type: 'image',
                source: {
                  type: 'file',
                  value:
                    'https://generativelanguage.googleapis.com/v1beta/files/abc-123',
                  provider: 'gemini',
                  mimeType: 'image/png',
                },
              },
            ],
          },
        ],
      }),
    )

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]!
    const parts = payload.contents.at(-1).parts
    const filePart = parts.find((p: any) => p.fileData)
    expect(filePart.fileData).toEqual({
      fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc-123',
      mimeType: 'image/png',
    })
  })

  it('rejects a foreign provider file handle before any request is sent', async () => {
    mocks.generateContentStreamSpy.mockResolvedValueOnce(emptyStream())
    const adapter = new GeminiTextAdapter({ apiKey: 'k' }, 'gemini-2.5-pro')

    await expect(
      collectChunks(
        chat({
          adapter,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'file',
                    value: 'file-openai-1',
                    provider: 'openai',
                  },
                },
              ],
            },
          ],
        }),
      ),
    ).rejects.toThrow(/gemini/)
    expect(mocks.generateContentStreamSpy).not.toHaveBeenCalled()
  })
})
