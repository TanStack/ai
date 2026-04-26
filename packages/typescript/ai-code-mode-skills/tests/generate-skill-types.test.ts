import { describe, expect, it } from 'vitest'
import { generateSkillTypes } from '../src/generate-skill-types'
import type { Skill } from '../src/types'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'id',
    name: 'skill_name',
    description: 'A skill',
    code: '',
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

describe('generateSkillTypes', () => {
  it('returns empty string for empty skills array', () => {
    expect(generateSkillTypes([])).toBe('')
  })

  it('generates declare function with snake_case name preserved', () => {
    const skill = makeSkill({
      name: 'fetch_stats',
      inputSchema: { type: 'string' },
      outputSchema: { type: 'number' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('declare function skill_fetch_stats')
    expect(result).toContain('Promise<number>')
  })

  it('inlines primitive input/output types', () => {
    const skill = makeSkill({
      inputSchema: { type: 'string' },
      outputSchema: { type: 'boolean' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('input: string')
    expect(result).toContain('Promise<boolean>')
  })

  it('creates interface for object input with properties', () => {
    const skill = makeSkill({
      name: 'fetch_data',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
        },
        required: ['owner', 'repo'],
      },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('interface SkillFetchDataInput')
    expect(result).toContain('owner: string')
    expect(result).toContain('repo: string')
    expect(result).toContain('input: SkillFetchDataInput')
  })

  it('marks non-required properties as optional', () => {
    const skill = makeSkill({
      inputSchema: {
        type: 'object',
        properties: {
          required_field: { type: 'string' },
          optional_field: { type: 'number' },
        },
        required: ['required_field'],
      },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('required_field: string')
    expect(result).toContain('optional_field?: number')
  })

  it('quotes property names that are not valid identifiers', () => {
    const skill = makeSkill({
      inputSchema: {
        type: 'object',
        properties: {
          'with-dash': { type: 'string' },
          '123numeric': { type: 'string' },
        },
        required: [],
      },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('"with-dash"')
    expect(result).toContain('"123numeric"')
  })

  it('converts array schemas to Array<T>', () => {
    const skill = makeSkill({
      inputSchema: { type: 'array', items: { type: 'string' } },
      outputSchema: { type: 'array' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('input: Array<string>')
    expect(result).toContain('Promise<Array<unknown>>')
  })

  it('converts enum schemas to a union of string literals', () => {
    const skill = makeSkill({
      inputSchema: { enum: ['red', 'green', 'blue'] },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('"red" | "green" | "blue"')
  })

  it('converts anyOf / oneOf to a union type', () => {
    const skill = makeSkill({
      inputSchema: {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('string | number')
  })

  it('handles type arrays like ["string", "null"]', () => {
    const skill = makeSkill({
      inputSchema: { type: ['string', 'null'] },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('string | null')
  })

  it('embeds usageHints as @hint JSDoc tags', () => {
    const skill = makeSkill({
      usageHints: ['Use when searching', 'Also good for filtering'],
      inputSchema: { type: 'string' },
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('@hint Use when searching')
    expect(result).toContain('@hint Also good for filtering')
  })

  it('falls back to unknown for schemas it cannot represent', () => {
    const skill = makeSkill({
      inputSchema: { mystery: true } as Record<string, unknown>,
      outputSchema: { type: 'string' },
    })
    const result = generateSkillTypes([skill])
    expect(result).toContain('input: unknown')
  })

  it('handles multiple skills in order', () => {
    const skills = [
      makeSkill({
        name: 'first',
        inputSchema: { type: 'string' },
        outputSchema: { type: 'string' },
      }),
      makeSkill({
        name: 'second',
        inputSchema: { type: 'number' },
        outputSchema: { type: 'number' },
      }),
    ]
    const result = generateSkillTypes(skills)
    const firstIdx = result.indexOf('skill_first')
    const secondIdx = result.indexOf('skill_second')
    expect(firstIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
  })
})
