import { describe, expect, it, vi } from 'vitest'
import { selectRelevantSnippets } from '../src/select-relevant-snippets'
import { createMemorySnippetStorage } from '../src/storage/memory-storage'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { Snippet } from '../src/types'

const chatMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/ai', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, chat: chatMock }
})

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'id',
    name: 'fetch_data',
    description: 'Fetches data',
    code: 'return 1;',
    inputSchema: {},
    outputSchema: {},
    usageHints: [],
    dependsOn: [],
    trustLevel: 'untrusted',
    stats: { executions: 0, successRate: 0 },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function streamChunks(text: string) {
  return (async function* () {
    yield { type: 'TEXT_MESSAGE_CONTENT' as const, delta: text }
  })()
}

const dummyAdapter = {} as AnyTextAdapter
const userMessage: ModelMessage = {
  role: 'user',
  content: 'please use github tool',
}

describe('selectRelevantSnippets', () => {
  it('returns empty array when the snippet index is empty', async () => {
    const storage = createMemorySnippetStorage([])
    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: [],
      maxSnippets: 5,
      storage,
    })
    expect(result).toEqual([])
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('returns empty array when there are no messages', async () => {
    const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toEqual([])
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('returns snippets whose names were selected by the model', async () => {
    const snippet = makeSnippet({ name: 'github_stats' })
    const storage = createMemorySnippetStorage([snippet])
    chatMock.mockReturnValueOnce(streamChunks('["github_stats"]'))

    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('github_stats')
  })

  it('strips markdown code fences around the JSON response', async () => {
    const snippet = makeSnippet({ name: 'github_stats' })
    const storage = createMemorySnippetStorage([snippet])
    chatMock.mockReturnValueOnce(streamChunks('```json\n["github_stats"]\n```'))

    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toHaveLength(1)
  })

  it('returns an empty array when the model response is not an array', async () => {
    const snippet = makeSnippet({ name: 'github_stats' })
    const storage = createMemorySnippetStorage([snippet])
    chatMock.mockReturnValueOnce(streamChunks('{"not": "an array"}'))

    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toEqual([])
  })

  it('returns empty array when JSON parsing fails (safe fallback)', async () => {
    const snippet = makeSnippet({ name: 'github_stats' })
    const storage = createMemorySnippetStorage([snippet])
    chatMock.mockReturnValueOnce(streamChunks('not json at all'))

    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toEqual([])
  })

  it('truncates model selections to maxSnippets', async () => {
    const storage = createMemorySnippetStorage([
      makeSnippet({ id: '1', name: 'a' }),
      makeSnippet({ id: '2', name: 'b' }),
      makeSnippet({ id: '3', name: 'c' }),
    ])
    chatMock.mockReturnValueOnce(streamChunks('["a","b","c"]'))

    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 2,
      storage,
    })
    expect(result).toHaveLength(2)
  })

  it('filters out snippet names that no longer resolve in storage', async () => {
    const snippet = makeSnippet({ name: 'still_exists' })
    const storage = createMemorySnippetStorage([snippet])
    chatMock.mockReturnValueOnce(
      streamChunks('["still_exists","deleted_snippet"]'),
    )

    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('still_exists')
  })

  it('returns empty array when the chat stream throws', async () => {
    const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
    chatMock.mockImplementationOnce(() => {
      throw new Error('network down')
    })
    const result = await selectRelevantSnippets({
      adapter: dummyAdapter,
      messages: [userMessage],
      snippetIndex: await storage.loadIndex(),
      maxSnippets: 5,
      storage,
    })
    expect(result).toEqual([])
  })
})
