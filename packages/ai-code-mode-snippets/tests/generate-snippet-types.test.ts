import { describe, expect, it } from 'vitest'
import { generateSnippetTypes } from '../src/generate-snippet-types'
import type { Snippet } from '../src/types'

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'id',
    name: 'snippet_name',
    description: 'A snippet',
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

describe('generateSnippetTypes', () => {
  it('returns empty string for empty snippets array', () => {
    expect(generateSnippetTypes([])).toBe('')
  })

  it('generates declare function with snake_case name preserved', () => {
    const snippet = makeSnippet({
      name: 'fetch_stats',
      inputSchema: { type: 'string' },
      outputSchema: { type: 'number' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('declare function snippet_fetch_stats')
    expect(result).toContain('Promise<number>')
  })

  it('inlines primitive input/output types', () => {
    const snippet = makeSnippet({
      inputSchema: { type: 'string' },
      outputSchema: { type: 'boolean' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('input: string')
    expect(result).toContain('Promise<boolean>')
  })

  it('creates interface for object input with properties', () => {
    const snippet = makeSnippet({
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
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('interface SnippetFetchDataInput')
    expect(result).toContain('owner: string')
    expect(result).toContain('repo: string')
    expect(result).toContain('input: SnippetFetchDataInput')
  })

  it('marks non-required properties as optional', () => {
    const snippet = makeSnippet({
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
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('required_field: string')
    expect(result).toContain('optional_field?: number')
  })

  it('quotes property names that are not valid identifiers', () => {
    const snippet = makeSnippet({
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
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('"with-dash"')
    expect(result).toContain('"123numeric"')
  })

  it('converts array schemas to Array<T>', () => {
    const snippet = makeSnippet({
      inputSchema: { type: 'array', items: { type: 'string' } },
      outputSchema: { type: 'array' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('input: Array<string>')
    expect(result).toContain('Promise<Array<unknown>>')
  })

  it('converts enum schemas to a union of string literals', () => {
    const snippet = makeSnippet({
      inputSchema: { enum: ['red', 'green', 'blue'] },
      outputSchema: { type: 'string' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('"red" | "green" | "blue"')
  })

  it('converts anyOf / oneOf to a union type', () => {
    const snippet = makeSnippet({
      inputSchema: {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      },
      outputSchema: { type: 'string' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('string | number')
  })

  it('handles type arrays like ["string", "null"]', () => {
    const snippet = makeSnippet({
      inputSchema: { type: ['string', 'null'] },
      outputSchema: { type: 'string' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('string | null')
  })

  it('embeds usageHints as @hint JSDoc tags', () => {
    const snippet = makeSnippet({
      usageHints: ['Use when searching', 'Also good for filtering'],
      inputSchema: { type: 'string' },
      outputSchema: { type: 'string' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('@hint Use when searching')
    expect(result).toContain('@hint Also good for filtering')
  })

  it('falls back to unknown for schemas it cannot represent', () => {
    const snippet = makeSnippet({
      inputSchema: { mystery: true } as Record<string, unknown>,
      outputSchema: { type: 'string' },
    })
    const result = generateSnippetTypes([snippet])
    expect(result).toContain('input: unknown')
  })

  it('handles multiple snippets in order', () => {
    const snippets = [
      makeSnippet({
        name: 'first',
        inputSchema: { type: 'string' },
        outputSchema: { type: 'string' },
      }),
      makeSnippet({
        name: 'second',
        inputSchema: { type: 'number' },
        outputSchema: { type: 'number' },
      }),
    ]
    const result = generateSnippetTypes(snippets)
    const firstIdx = result.indexOf('snippet_first')
    const secondIdx = result.indexOf('snippet_second')
    expect(firstIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
  })
})
