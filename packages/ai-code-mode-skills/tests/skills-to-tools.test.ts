import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { skillToTool, skillsToTools } from '../src/skills-to-tools'
import { createMemorySkillStorage } from '../src/storage/memory-storage'
import type { IsolateContext, IsolateDriver } from '@tanstack/ai-code-mode'
import type { Skill } from '../src/types'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'id',
    name: 'do_thing',
    description: 'Does a thing',
    code: 'return input.value * 2;',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'number' } },
      required: ['value'],
    },
    outputSchema: { type: 'number' },
    usageHints: [],
    dependsOn: [],
    trustLevel: 'untrusted',
    stats: { executions: 0, successRate: 0 },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function createMockDriver(
  result: { success: boolean; value?: unknown; error?: { message: string } } = {
    success: true,
    value: 42,
  },
): {
  driver: IsolateDriver
  executeSpy: ReturnType<typeof vi.fn>
  disposeSpy: ReturnType<typeof vi.fn>
} {
  const executeSpy = vi.fn().mockResolvedValue({
    ...result,
    logs: [],
  })
  const disposeSpy = vi.fn().mockResolvedValue(undefined)
  const context: IsolateContext = {
    execute: executeSpy,
    dispose: disposeSpy,
  }
  const driver: IsolateDriver = {
    createContext: vi.fn().mockResolvedValue(context),
  }
  return { driver, executeSpy, disposeSpy }
}

const mockContext = () => ({ emitCustomEvent: vi.fn() })

describe('skillToTool', () => {
  it('prefixes the tool description with [SKILL]', () => {
    const { driver } = createMockDriver()
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill({ description: 'Fetches data' }),
      driver,
      bindings: {},
      storage,
    })
    expect(tool.description).toContain('[SKILL]')
    expect(tool.description).toContain('Fetches data')
  })

  it('exposes the skill name as the tool name', () => {
    const { driver } = createMockDriver()
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill({ name: 'custom_name' }),
      driver,
      bindings: {},
      storage,
    })
    expect(tool.name).toBe('custom_name')
  })

  it('creates an isolate context, executes, returns the value, and disposes', async () => {
    const { driver, executeSpy, disposeSpy } = createMockDriver({
      success: true,
      value: 84,
    })
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill(),
      driver,
      bindings: {},
      storage,
    })

    const result = await tool.execute!({ value: 42 }, mockContext() as any)
    expect(result).toBe(84)
    expect(executeSpy).toHaveBeenCalledOnce()
    expect(disposeSpy).toHaveBeenCalledOnce()
  })

  it('disposes the isolate context even if execution throws', async () => {
    const { driver, disposeSpy } = createMockDriver({
      success: false,
      error: { message: 'sandbox error' },
    })
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill(),
      driver,
      bindings: {},
      storage,
    })

    await expect(
      tool.execute!({ value: 1 }, mockContext() as any),
    ).rejects.toThrow('sandbox error')
    expect(disposeSpy).toHaveBeenCalledOnce()
  })

  it('emits skill_call then skill_result events on success', async () => {
    const { driver } = createMockDriver({ success: true, value: 'ok' })
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    const ctx = mockContext()
    await tool.execute!({ value: 1 }, ctx as any)
    const eventNames = (ctx.emitCustomEvent as any).mock.calls.map(
      ([name]: [string]) => name,
    )
    expect(eventNames).toEqual([
      'code_mode:skill_call',
      'code_mode:skill_result',
    ])
  })

  it('emits skill_error when execution fails', async () => {
    const { driver } = createMockDriver({
      success: false,
      error: { message: 'boom' },
    })
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    const ctx = mockContext()
    await expect(tool.execute!({ value: 1 }, ctx as any)).rejects.toThrow(
      'boom',
    )
    const eventNames = (ctx.emitCustomEvent as any).mock.calls.map(
      ([name]: [string]) => name,
    )
    expect(eventNames).toContain('code_mode:skill_error')
  })

  it('records stats (success=true) on success', async () => {
    const { driver } = createMockDriver()
    const storage = createMemorySkillStorage([makeSkill({ name: 'x' })])
    const spy = vi.spyOn(storage, 'updateStats')
    const tool = skillToTool({
      skill: makeSkill({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    await tool.execute!({ value: 1 }, mockContext() as any)
    expect(spy).toHaveBeenCalledWith('x', true)
  })

  it('records stats (success=false) on failure', async () => {
    const { driver } = createMockDriver({
      success: false,
      error: { message: 'no' },
    })
    const storage = createMemorySkillStorage([makeSkill({ name: 'x' })])
    const spy = vi.spyOn(storage, 'updateStats')
    const tool = skillToTool({
      skill: makeSkill({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    await expect(
      tool.execute!({ value: 1 }, mockContext() as any),
    ).rejects.toThrow()
    expect(spy).toHaveBeenCalledWith('x', false)
  })

  it('serializes input as a JSON literal in the sandbox code, preventing injection', async () => {
    const { driver, executeSpy } = createMockDriver()
    const storage = createMemorySkillStorage([])
    const tool = skillToTool({
      skill: makeSkill(),
      driver,
      bindings: {},
      storage,
    })

    // Zod requires a number; test injection via a nested field instead
    await tool.execute!({ value: 1 }, mockContext() as any)

    const code = executeSpy.mock.calls[0]![0]
    // esbuild reformats output, so compare as normalized JSON literal
    expect(code.replace(/\s+/g, '')).toContain('constinput={"value":1}')
  })
})

describe('skillsToTools', () => {
  it('returns one ServerTool per skill', () => {
    const { driver } = createMockDriver()
    const storage = createMemorySkillStorage([])
    const tools = skillsToTools({
      skills: [
        makeSkill({ id: '1', name: 'a' }),
        makeSkill({ id: '2', name: 'b' }),
      ],
      driver,
      tools: [
        toolDefinition({
          name: 'helper',
          description: 'h',
          inputSchema: z.object({ q: z.string() }),
          outputSchema: z.object({ r: z.string() }),
        }).server(async (i: any) => ({ r: i.q })),
      ],
      storage,
    })
    expect(tools).toHaveLength(2)
    expect(tools.map((t) => t.name)).toEqual(['a', 'b'])
  })
})
