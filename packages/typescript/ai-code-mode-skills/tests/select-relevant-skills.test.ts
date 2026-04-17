import { describe, expect, it, vi } from 'vitest'
import { selectRelevantSkills } from '../src/select-relevant-skills'
import { createMemorySkillStorage } from '../src/storage/memory-storage'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { Skill } from '../src/types'

const chatMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/ai', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, chat: chatMock }
})

function makeSkill(overrides: Partial<Skill> = {}): Skill {
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

describe('selectRelevantSkills', () => {
  it('returns empty array when the skill index is empty', async () => {
    const storage = createMemorySkillStorage([])
    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: [],
      maxSkills: 5,
      storage,
    })
    expect(result).toEqual([])
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('returns empty array when there are no messages', async () => {
    const storage = createMemorySkillStorage([makeSkill({ name: 'x' })])
    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toEqual([])
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('returns skills whose names were selected by the model', async () => {
    const skill = makeSkill({ name: 'github_stats' })
    const storage = createMemorySkillStorage([skill])
    chatMock.mockReturnValueOnce(streamChunks('["github_stats"]'))

    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('github_stats')
  })

  it('strips markdown code fences around the JSON response', async () => {
    const skill = makeSkill({ name: 'github_stats' })
    const storage = createMemorySkillStorage([skill])
    chatMock.mockReturnValueOnce(streamChunks('```json\n["github_stats"]\n```'))

    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toHaveLength(1)
  })

  it('returns an empty array when the model response is not an array', async () => {
    const skill = makeSkill({ name: 'github_stats' })
    const storage = createMemorySkillStorage([skill])
    chatMock.mockReturnValueOnce(streamChunks('{"not": "an array"}'))

    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toEqual([])
  })

  it('returns empty array when JSON parsing fails (safe fallback)', async () => {
    const skill = makeSkill({ name: 'github_stats' })
    const storage = createMemorySkillStorage([skill])
    chatMock.mockReturnValueOnce(streamChunks('not json at all'))

    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toEqual([])
  })

  it('truncates model selections to maxSkills', async () => {
    const storage = createMemorySkillStorage([
      makeSkill({ id: '1', name: 'a' }),
      makeSkill({ id: '2', name: 'b' }),
      makeSkill({ id: '3', name: 'c' }),
    ])
    chatMock.mockReturnValueOnce(streamChunks('["a","b","c"]'))

    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 2,
      storage,
    })
    expect(result).toHaveLength(2)
  })

  it('filters out skill names that no longer resolve in storage', async () => {
    const skill = makeSkill({ name: 'still_exists' })
    const storage = createMemorySkillStorage([skill])
    chatMock.mockReturnValueOnce(
      streamChunks('["still_exists","deleted_skill"]'),
    )

    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('still_exists')
  })

  it('returns empty array when the chat stream throws', async () => {
    const storage = createMemorySkillStorage([makeSkill({ name: 'x' })])
    chatMock.mockImplementationOnce(() => {
      throw new Error('network down')
    })
    const result = await selectRelevantSkills({
      adapter: dummyAdapter,
      messages: [userMessage],
      skillIndex: await storage.loadIndex(),
      maxSkills: 5,
      storage,
    })
    expect(result).toEqual([])
  })
})
