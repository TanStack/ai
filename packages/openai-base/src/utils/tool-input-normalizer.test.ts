import { describe, expect, it } from 'vitest'
import { createToolInputNormalizer } from './tool-input-normalizer'
import type { Tool } from '@tanstack/ai'

describe('createToolInputNormalizer', () => {
  it('normalizes own JSON keys while retaining nullable fields and source values', () => {
    const schemaRaw =
      '{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":["string","null"]}},"required":[]}'
    const inputSchema = JSON.parse(schemaRaw)
    const normalize = createToolInputNormalizer([
      { name: 'inspect', description: 'Inspect', inputSchema },
    ])
    const raw = '{"__proto__":null,"constructor":null}'
    const input = JSON.parse(raw)
    const result = normalize('inspect', input)
    if (result === null || typeof result !== 'object')
      throw new Error('Expected normalized object input')
    expect(result).toEqual({ constructor: null })
    expect(Object.hasOwn(result, '__proto__')).toBe(false)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(JSON.stringify(input)).toBe(raw)
    expect(JSON.stringify(inputSchema)).toBe(schemaRaw)
  })
  it('removes a null synthesized for an optional enum', () => {
    const tool: Tool = {
      name: 'optional_enum',
      description: 'Uses an optional literal value',
      inputSchema: {
        type: 'object',
        properties: {
          value: { type: 'string', enum: ['canary'] },
        },
        required: [],
      },
    }
    const normalize = createToolInputNormalizer([tool])

    expect(normalize(tool.name, { value: null })).toEqual({})
  })

  it('leaves non-strict tool inputs unchanged', () => {
    const tool: Tool = {
      name: 'non_strict',
      description: 'Uses a schema outside the strict subset',
      inputSchema: {
        type: 'object',
        properties: { optional: { type: 'string' } },
        oneOf: [{ required: ['optional'] }, { required: [] }],
      },
    }
    const normalize = createToolInputNormalizer([tool])
    const input = { optional: null }

    expect(normalize(tool.name, input)).toBe(input)
  })

  it('does not guess when public tool names are ambiguous', () => {
    const tools: Array<Tool> = [
      {
        name: 'duplicate',
        description: 'First tool',
        inputSchema: {
          type: 'object',
          properties: { firstOptional: { type: 'string' } },
        },
      },
      {
        name: 'duplicate',
        description: 'Second tool',
        inputSchema: {
          type: 'object',
          properties: { secondOptional: { type: 'string' } },
        },
      },
    ]
    const normalize = createToolInputNormalizer(tools)
    const input = { firstOptional: null, secondOptional: null }

    expect(normalize('duplicate', input)).toBe(input)
  })

  it('leaves anyOf inputs unchanged when variant widening is ambiguous', () => {
    const tool: Tool = {
      name: 'union',
      description: 'Uses variant-specific nullability',
      inputSchema: {
        type: 'object',
        properties: {
          value: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  kind: { const: 'optional' },
                  note: { type: 'string' },
                },
                required: ['kind'],
              },
              {
                type: 'object',
                properties: {
                  kind: { const: 'nullable' },
                  note: { type: ['string', 'null'] },
                },
                required: ['kind', 'note'],
              },
            ],
          },
        },
        required: ['value'],
      },
    }
    const normalize = createToolInputNormalizer([tool])
    const input = { value: { kind: 'nullable', note: null } }

    expect(normalize(tool.name, input)).toBe(input)
  })

  it.each([
    ['const', { anyOf: [{ type: 'string' }, { const: null }] }],
    ['enum', { anyOf: [{ type: 'string' }, { enum: [null] }] }],
  ])('preserves genuine null accepted by an anyOf %s branch', (_, value) => {
    const tool: Tool = {
      name: 'nullable_union',
      description: 'Uses an optional union that genuinely accepts null',
      inputSchema: {
        type: 'object',
        properties: { value },
        required: [],
      },
    }
    const normalize = createToolInputNormalizer([tool])
    const input = { value: null }

    expect(normalize(tool.name, input)).toBe(input)
  })

  it('builds the inverse map from the supplied converter', () => {
    const tool: Tool = {
      name: 'ask',
      description: 'Ask',
      inputSchema: {
        type: 'object',
        properties: {
          note: { type: 'string' },
        },
        required: ['note'],
      },
    }

    const defaultNormalize = createToolInputNormalizer([tool])
    expect(defaultNormalize(tool.name, { note: null })).toEqual({ note: null })

    const normalize = createToolInputNormalizer([tool], () => ({
      schema: {
        type: 'object',
        properties: { note: { type: ['string', 'null'] } },
        required: ['note'],
      },
      nullWideningMap: { properties: { note: { widened: true } } },
    }))
    expect(normalize(tool.name, { note: null })).toEqual({})
  })
})
