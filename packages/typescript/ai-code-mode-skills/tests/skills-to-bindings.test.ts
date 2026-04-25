import { describe, expect, it, vi } from 'vitest'
import {
  skillsToBindings,
  skillsToSimpleBindings,
} from '../src/skills-to-bindings'
import { createMemorySkillStorage } from '../src/storage/memory-storage'
import type { Skill } from '../src/types'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'id',
    name: 'sample',
    description: 'Sample skill',
    code: 'return input.value * 2;',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    usageHints: [],
    dependsOn: [],
    trustLevel: 'untrusted',
    stats: { executions: 0, successRate: 0 },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('skillsToBindings', () => {
  it('prefixes binding names with skill_', () => {
    const storage = createMemorySkillStorage([])
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'alpha' })],
      executeInSandbox: async () => undefined,
      storage,
    })
    expect(Object.keys(bindings)).toEqual(['skill_alpha'])
  })

  it('serializes input via JSON.stringify into the wrapped code', async () => {
    const storage = createMemorySkillStorage([])
    const executeInSandbox = vi.fn(async () => 'ok')
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x', code: 'return input;' })],
      executeInSandbox,
      storage,
    })

    await bindings.skill_x!.execute({ value: 42 })
    const call = executeInSandbox.mock.calls[0] as unknown as [string, unknown]
    expect(call[0]).toContain('const input = {"value":42}')
    expect(call[0]).toContain('return input;')
    expect(call[1]).toEqual({ value: 42 })
  })

  it('emits skill_call then skill_result events on success', async () => {
    const storage = createMemorySkillStorage([])
    const emitCustomEvent = vi.fn()
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x' })],
      executeInSandbox: async () => 42,
      storage,
      context: { emitCustomEvent } as any,
    })

    await bindings.skill_x!.execute({})

    const eventNames = emitCustomEvent.mock.calls.map(([name]) => name)
    expect(eventNames).toEqual([
      'code_mode:skill_call',
      'code_mode:skill_result',
    ])
  })

  it('emits skill_error when sandbox execution throws, and re-throws', async () => {
    const storage = createMemorySkillStorage([])
    const emitCustomEvent = vi.fn()
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x' })],
      executeInSandbox: async () => {
        throw new Error('boom')
      },
      storage,
      context: { emitCustomEvent } as any,
    })

    await expect(bindings.skill_x!.execute({})).rejects.toThrow('boom')
    const eventNames = emitCustomEvent.mock.calls.map(([name]) => name)
    expect(eventNames).toContain('code_mode:skill_error')
  })

  it('updates storage stats with success=true on success', async () => {
    const storage = createMemorySkillStorage([
      makeSkill({ name: 'x', stats: { executions: 0, successRate: 0 } }),
    ])
    const updateStats = vi.spyOn(storage, 'updateStats')
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x' })],
      executeInSandbox: async () => 1,
      storage,
    })

    await bindings.skill_x!.execute({})
    expect(updateStats).toHaveBeenCalledWith('x', true)
  })

  it('updates storage stats with success=false on failure', async () => {
    const storage = createMemorySkillStorage([makeSkill({ name: 'x' })])
    const updateStats = vi.spyOn(storage, 'updateStats')
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x' })],
      executeInSandbox: async () => {
        throw new Error('fail')
      },
      storage,
    })

    await expect(bindings.skill_x!.execute({})).rejects.toThrow()
    expect(updateStats).toHaveBeenCalledWith('x', false)
  })

  it('does not reject if storage.updateStats fails', async () => {
    const storage = createMemorySkillStorage([makeSkill({ name: 'x' })])
    storage.updateStats = async () => {
      throw new Error('stats broke')
    }
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x' })],
      executeInSandbox: async () => 'ok',
      storage,
    })

    await expect(bindings.skill_x!.execute({})).resolves.toBe('ok')
  })

  it('serializes string inputs as JSON strings (prevents code injection via input)', async () => {
    const storage = createMemorySkillStorage([])
    const executeInSandbox = vi.fn(async () => null)
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x', code: 'return input;' })],
      executeInSandbox,
      storage,
    })

    // Adversarial payload: attempts to escape the wrapping const-declaration
    const malicious = `"); throw new Error("escaped"); ("`
    await bindings.skill_x!.execute(malicious)

    const wrappedCode = (
      executeInSandbox.mock.calls[0] as unknown as [string, unknown]
    )[0]
    // JSON.stringify quotes & escapes the whole thing — it becomes a string literal
    expect(wrappedCode).toContain(`const input = ${JSON.stringify(malicious)}`)
    // Ensure the raw payload is not present unquoted
    expect(wrappedCode).not.toContain(
      `const input = "); throw new Error("escaped"); ("`,
    )
  })

  it('forwards the configured input through to executeInSandbox unchanged', async () => {
    const storage = createMemorySkillStorage([])
    const executeInSandbox = vi.fn(async () => 'ok')
    const bindings = skillsToBindings({
      skills: [makeSkill({ name: 'x' })],
      executeInSandbox,
      storage,
    })

    const input = { complex: { nested: [1, 2] } }
    await bindings.skill_x!.execute(input)
    expect(
      (executeInSandbox.mock.calls[0] as unknown as [string, unknown])[1],
    ).toBe(input)
  })
})

describe('skillsToSimpleBindings', () => {
  it('prefixes names with skill_', () => {
    const bindings = skillsToSimpleBindings([makeSkill({ name: 'alpha' })])
    expect(Object.keys(bindings)).toEqual(['skill_alpha'])
  })

  it('exposes metadata without executing anything', () => {
    const skill = makeSkill({
      name: 'meta',
      description: 'desc',
      inputSchema: { type: 'string' },
      outputSchema: { type: 'number' },
    })
    const bindings = skillsToSimpleBindings([skill])
    expect(bindings.skill_meta!.name).toBe('skill_meta')
    expect(bindings.skill_meta!.description).toBe('desc')
    expect(bindings.skill_meta!.inputSchema).toEqual({ type: 'string' })
    expect(bindings.skill_meta!.outputSchema).toEqual({ type: 'number' })
  })

  it('execute() throws because execution is not available in this mode', async () => {
    const bindings = skillsToSimpleBindings([makeSkill({ name: 'x' })])
    await expect(bindings.skill_x!.execute({})).rejects.toThrow(
      /not available for execution/,
    )
  })
})
