import { describe, expect, it } from 'vitest'
import { toOpenAIStrict } from '../src/openai-strict.js'

describe('toOpenAIStrict', () => {
  it('marks every declared property as required', () => {
    const result = toOpenAIStrict({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
      required: ['a'],
    }) as { required: Array<string> }

    expect(result.required).toEqual(['a', 'b'])
  })

  it('widens originally-optional properties to allow null', () => {
    const result = toOpenAIStrict({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
      required: ['a'],
    }) as {
      properties: { a: { type: string }; b: { type: Array<string> } }
    }

    expect(result.properties.a).toEqual({ type: 'string' })
    expect(result.properties.b.type).toEqual(['number', 'null'])
  })

  it('sets additionalProperties: false on every object', () => {
    const result = toOpenAIStrict({
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: { x: { type: 'string' } },
          required: ['x'],
        },
      },
      required: ['nested'],
    }) as {
      additionalProperties: boolean
      properties: { nested: { additionalProperties: boolean } }
    }

    expect(result.additionalProperties).toBe(false)
    expect(result.properties.nested.additionalProperties).toBe(false)
  })

  it('rewrites oneOf to anyOf', () => {
    const result = toOpenAIStrict({
      oneOf: [{ type: 'string' }, { type: 'number' }],
    }) as { oneOf?: unknown; anyOf?: Array<unknown> }

    expect(result.oneOf).toBeUndefined()
    expect(result.anyOf).toHaveLength(2)
  })

  it('drops unrecognised keywords like minimum and pattern', () => {
    const result = toOpenAIStrict({
      type: 'number',
      minimum: 0,
      maximum: 100,
    }) as Record<string, unknown>

    expect(result.minimum).toBeUndefined()
    expect(result.maximum).toBeUndefined()
    expect(result.type).toBe('number')
  })
})
