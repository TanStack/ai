import { describe, expect, it, vi } from 'vitest'
import { createSkillManagementTools } from '../src/create-skill-management-tools'
import { createMemorySkillStorage } from '../src/storage/memory-storage'
import {
  createAlwaysTrustedStrategy,
  createDefaultTrustStrategy,
} from '../src/trust-strategies'

const mockContext = () => ({ emitCustomEvent: vi.fn() })

function getTool(
  tools: ReturnType<typeof createSkillManagementTools>,
  name: string,
) {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`Tool ${name} not found`)
  return tool
}

function validRegisterInput(
  overrides: Partial<{
    name: string
    description: string
    code: string
    inputSchema: string
    outputSchema: string
    usageHints: Array<string>
    dependsOn: Array<string>
  }> = {},
) {
  return {
    name: 'fetch_data',
    description: 'A skill',
    code: 'return input;',
    inputSchema: '{"type":"object","properties":{}}',
    outputSchema: '{"type":"object","properties":{}}',
    usageHints: ['Use for fetching'],
    dependsOn: [],
    ...overrides,
  }
}

describe('createSkillManagementTools', () => {
  it('exposes search_skills, get_skill, and register_skill', () => {
    const storage = createMemorySkillStorage([])
    const tools = createSkillManagementTools({ storage })
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_skill',
      'register_skill',
      'search_skills',
    ])
  })

  describe('search_skills', () => {
    it('returns lightweight matching entries', async () => {
      const storage = createMemorySkillStorage([
        {
          id: '1',
          name: 'github_stats',
          description: 'GitHub stats',
          code: 'secret',
          inputSchema: {},
          outputSchema: {},
          usageHints: ['for github'],
          dependsOn: [],
          trustLevel: 'untrusted',
          stats: { executions: 0, successRate: 0 },
          createdAt: '',
          updatedAt: '',
        },
      ])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'search_skills')
      const results = (await tool.execute!(
        { query: 'github', limit: 5 },
        mockContext() as any,
      )) as Array<Record<string, unknown>>
      expect(results).toHaveLength(1)
      expect(results[0]).not.toHaveProperty('code')
      expect(results[0]!.name).toBe('github_stats')
    })

    it('respects the limit parameter', async () => {
      const storage = createMemorySkillStorage([
        {
          id: 'a',
          name: 'data_one',
          description: '',
          code: '',
          inputSchema: {},
          outputSchema: {},
          usageHints: [],
          dependsOn: [],
          trustLevel: 'untrusted',
          stats: { executions: 0, successRate: 0 },
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b',
          name: 'data_two',
          description: '',
          code: '',
          inputSchema: {},
          outputSchema: {},
          usageHints: [],
          dependsOn: [],
          trustLevel: 'untrusted',
          stats: { executions: 0, successRate: 0 },
          createdAt: '',
          updatedAt: '',
        },
      ])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'search_skills')
      const results = (await tool.execute!(
        { query: 'data', limit: 1 },
        mockContext() as any,
      )) as Array<unknown>
      expect(results).toHaveLength(1)
    })
  })

  describe('get_skill', () => {
    it('returns an error object for a missing skill', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'get_skill')
      const result = (await tool.execute!(
        { name: 'missing' },
        mockContext() as any,
      )) as { error?: string }
      expect(result.error).toContain('not found')
    })

    it('returns the full skill including code when found', async () => {
      const storage = createMemorySkillStorage([
        {
          id: '1',
          name: 'alpha',
          description: 'Alpha',
          code: 'return 1;',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'number' },
          usageHints: ['hint'],
          dependsOn: [],
          trustLevel: 'untrusted',
          stats: { executions: 0, successRate: 0 },
          createdAt: '',
          updatedAt: '',
        },
      ])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'get_skill')
      const result = (await tool.execute!(
        { name: 'alpha' },
        mockContext() as any,
      )) as {
        name?: string
        code?: string
        inputSchema?: string
      }
      expect(result.name).toBe('alpha')
      expect(result.code).toBe('return 1;')
      expect(result.inputSchema).toBe('{"type":"object"}')
    })
  })

  describe('register_skill', () => {
    it('rejects names starting with external_', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      const result = (await tool.execute!(
        validRegisterInput({ name: 'external_evil' }),
        mockContext() as any,
      )) as { error?: string }
      expect(result.error).toContain("cannot start with 'external_'")
    })

    it('rejects names starting with skill_ (redundant prefix)', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      const result = (await tool.execute!(
        validRegisterInput({ name: 'skill_duplicate' }),
        mockContext() as any,
      )) as { error?: string }
      expect(result.error).toContain("should not include the 'skill_' prefix")
    })

    it('rejects malformed JSON inputSchema', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      const result = (await tool.execute!(
        validRegisterInput({ inputSchema: 'not valid json' }),
        mockContext() as any,
      )) as { error?: string }
      expect(result.error).toContain('inputSchema must be a valid JSON string')
    })

    it('rejects malformed JSON outputSchema', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      const result = (await tool.execute!(
        validRegisterInput({ outputSchema: '{' }),
        mockContext() as any,
      )) as { error?: string }
      expect(result.error).toContain('outputSchema must be a valid JSON string')
    })

    it('rejects a duplicate name', async () => {
      const storage = createMemorySkillStorage([
        {
          id: '1',
          name: 'existing',
          description: '',
          code: '',
          inputSchema: {},
          outputSchema: {},
          usageHints: [],
          dependsOn: [],
          trustLevel: 'untrusted',
          stats: { executions: 0, successRate: 0 },
          createdAt: '',
          updatedAt: '',
        },
      ])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      const result = (await tool.execute!(
        validRegisterInput({ name: 'existing' }),
        mockContext() as any,
      )) as { error?: string }
      expect(result.error).toContain('already exists')
    })

    it('persists a valid skill with defaults', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      const result = (await tool.execute!(
        validRegisterInput({ name: 'valid_skill' }),
        mockContext() as any,
      )) as { success?: boolean; skillId?: string }
      expect(result.success).toBe(true)
      expect(result.skillId).toMatch(/^[0-9a-f-]{36}$/)

      const saved = await storage.get('valid_skill')
      expect(saved).not.toBeNull()
      expect(saved!.stats).toEqual({ executions: 0, successRate: 0 })
    })

    it('applies the trust strategy to set initial trust level', async () => {
      const storage = createMemorySkillStorage([])
      const tools = createSkillManagementTools({
        storage,
        trustStrategy: createAlwaysTrustedStrategy(),
      })
      const tool = getTool(tools, 'register_skill')
      await tool.execute!(
        validRegisterInput({ name: 's1' }),
        mockContext() as any,
      )
      const saved = await storage.get('s1')
      expect(saved!.trustLevel).toBe('trusted')
    })

    it('prefers explicit trustStrategy over storage.trustStrategy', async () => {
      const storage = createMemorySkillStorage({
        trustStrategy: createAlwaysTrustedStrategy(),
      })
      const tools = createSkillManagementTools({
        storage,
        trustStrategy: createDefaultTrustStrategy(),
      })
      const tool = getTool(tools, 'register_skill')
      await tool.execute!(
        validRegisterInput({ name: 's1' }),
        mockContext() as any,
      )
      const saved = await storage.get('s1')
      expect(saved!.trustLevel).toBe('untrusted')
    })

    it('falls back to storage.trustStrategy when none provided', async () => {
      const storage = createMemorySkillStorage({
        trustStrategy: createAlwaysTrustedStrategy(),
      })
      const tools = createSkillManagementTools({ storage })
      const tool = getTool(tools, 'register_skill')
      await tool.execute!(
        validRegisterInput({ name: 's1' }),
        mockContext() as any,
      )
      const saved = await storage.get('s1')
      expect(saved!.trustLevel).toBe('trusted')
    })
  })
})
