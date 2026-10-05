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
  it('removes only nulls synthesized for optional fields', () => {
    const tool: Tool = {
      name: 'optional_enum',
      description: 'Uses optional and genuinely nullable values',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['canary'] },
          note: { type: ['string', 'null'] },
        },
        required: [],
      },
    }
    const normalize = createToolInputNormalizer([tool])

    expect(normalize(tool.name, { mode: null, note: null })).toEqual({
      note: null,
    })
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
})
