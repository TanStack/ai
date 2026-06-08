import { describe, expect, it } from 'vitest'
import { makeStructuredOutputCompatible } from '../src/utils/schema-converter'

describe('makeStructuredOutputCompatible', () => {
  it('should add additionalProperties: false to object schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['name'])
    expect(result.additionalProperties).toBe(false)
  })

  it('should make all properties required', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['name'])
    expect(result.required).toEqual(['name', 'age'])
  })

  it('should make optional fields nullable', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nickname: { type: 'string' },
      },
      required: ['name'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['name'])
    expect(result.properties.name.type).toBe('string')
    expect(result.properties.nickname.type).toEqual(['string', 'null'])
  })

  it('should handle anyOf (union types) by transforming each variant', () => {
    const schema = {
      type: 'object',
      properties: {
        u: {
          anyOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' } },
              required: ['a'],
            },
            {
              type: 'object',
              properties: { b: { type: 'number' } },
              required: ['b'],
            },
          ],
        },
      },
      required: ['u'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['u'])

    // Each variant in anyOf should have additionalProperties: false
    expect(result.properties.u.anyOf[0].additionalProperties).toBe(false)
    expect(result.properties.u.anyOf[1].additionalProperties).toBe(false)

    // Verify complete structure
    expect(result.additionalProperties).toBe(false)
    expect(result.required).toEqual(['u'])
    expect(result.properties.u.anyOf).toHaveLength(2)
    expect(result.properties.u.anyOf[0].required).toEqual(['a'])
    expect(result.properties.u.anyOf[1].required).toEqual(['b'])
  })

  it('should handle nested objects inside anyOf', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          anyOf: [
            {
              type: 'object',
              properties: {
                nested: {
                  type: 'object',
                  properties: { x: { type: 'string' } },
                  required: ['x'],
                },
              },
              required: ['nested'],
            },
          ],
        },
      },
      required: ['data'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['data'])

    // The nested object inside anyOf variant should also have additionalProperties: false
    expect(result.properties.data.anyOf[0].additionalProperties).toBe(false)
    expect(
      result.properties.data.anyOf[0].properties.nested.additionalProperties,
    ).toBe(false)
  })

  it('should handle arrays with items', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
      required: ['items'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['items'])
    expect(result.properties.items.items.additionalProperties).toBe(false)
  })

  it('should throw an error for oneOf schemas (not supported by OpenAI)', () => {
    const schema = {
      type: 'object',
      properties: {
        u: {
          oneOf: [
            {
              type: 'object',
              properties: { type: { const: 'a' }, value: { type: 'string' } },
              required: ['type', 'value'],
            },
            {
              type: 'object',
              properties: { type: { const: 'b' }, count: { type: 'number' } },
              required: ['type', 'count'],
            },
          ],
        },
      },
      required: ['u'],
    }

    expect(() => makeStructuredOutputCompatible(schema, ['u'])).toThrow(
      'oneOf is not supported in OpenAI structured output schemas',
    )
  })

  it('should use schema.required as default when originalRequired is not provided', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nickname: { type: 'string' },
      },
      required: ['name'],
    }

    // Call without second argument — should use schema.required
    const result: any = makeStructuredOutputCompatible(schema)
    expect(result.properties.name.type).toBe('string')
    expect(result.properties.nickname.type).toEqual(['string', 'null'])
    expect(result.required).toEqual(['name', 'nickname'])
  })

  it('should make optional object properties nullable after recursion', () => {
    const schema = {
      type: 'object',
      properties: {
        required_obj: {
          type: 'object',
          properties: { x: { type: 'string' } },
          required: ['x'],
        },
        optional_obj: {
          type: 'object',
          properties: { y: { type: 'number' } },
          required: ['y'],
        },
      },
      required: ['required_obj'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['required_obj'])

    // required_obj should be recursed into but NOT made nullable
    expect(result.properties.required_obj.additionalProperties).toBe(false)
    expect(result.properties.required_obj.type).toBe('object')

    // optional_obj should be recursed into AND made nullable
    expect(result.properties.optional_obj.additionalProperties).toBe(false)
    expect(result.properties.optional_obj.type).toEqual(['object', 'null'])
  })

  it('should make optional array properties nullable after recursion', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' } },
            required: ['label'],
          },
        },
      },
      required: [],
    }

    const result: any = makeStructuredOutputCompatible(schema, [])

    // tags is optional, should be nullable AND have items recursed
    expect(result.properties.tags.type).toEqual(['array', 'null'])
    expect(result.properties.tags.items.additionalProperties).toBe(false)
  })

  it('should make optional anyOf properties nullable by adding null variant', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
      required: [],
    }

    const result: any = makeStructuredOutputCompatible(schema, [])

    // optional anyOf should have a null variant added
    expect(result.properties.value.anyOf).toContainEqual({ type: 'null' })
    expect(result.properties.value.anyOf).toHaveLength(3)
  })

  it('should strip unsupported string formats (e.g. uri) anywhere in the tree', () => {
    const schema = {
      type: 'object',
      properties: {
        data: { type: 'string', format: 'uri' },
        nested: {
          type: 'object',
          properties: {
            link: { type: 'string', format: 'uri-reference' },
          },
          required: ['link'],
        },
        list: {
          type: 'array',
          items: { type: 'string', format: 'iri' },
        },
      },
      required: ['data', 'nested', 'list'],
    }

    const result: any = makeStructuredOutputCompatible(schema, [
      'data',
      'nested',
      'list',
    ])

    expect(result.properties.data.format).toBeUndefined()
    expect(result.properties.data.type).toBe('string')
    expect(result.properties.nested.properties.link.format).toBeUndefined()
    expect(result.properties.list.items.format).toBeUndefined()
  })

  it('should retain supported string formats', () => {
    const schema = {
      type: 'object',
      properties: {
        when: { type: 'string', format: 'date-time' },
        who: { type: 'string', format: 'email' },
        id: { type: 'string', format: 'uuid' },
      },
      required: ['when', 'who', 'id'],
    }

    const result: any = makeStructuredOutputCompatible(schema, [
      'when',
      'who',
      'id',
    ])

    expect(result.properties.when.format).toBe('date-time')
    expect(result.properties.who.format).toBe('email')
    expect(result.properties.id.format).toBe('uuid')
  })

  it('should preserve a property literally named "format"', () => {
    const schema = {
      type: 'object',
      properties: {
        // "format" here is a property NAME, not the format keyword — its value
        // is a schema object and must survive (only its inner unsupported
        // format keyword is stripped).
        format: { type: 'string', format: 'uri' },
      },
      required: ['format'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['format'])

    expect(result.properties.format).toBeDefined()
    expect(result.properties.format.type).toBe('string')
    expect(result.properties.format.format).toBeUndefined()
  })

  it('should not mutate the input schema when stripping formats', () => {
    const schema = {
      type: 'object',
      properties: {
        data: { type: 'string', format: 'uri' },
      },
      required: ['data'],
    }

    makeStructuredOutputCompatible(schema, ['data'])

    // Original definition is untouched — the strip pass returns a fresh tree.
    expect(schema.properties.data.format).toBe('uri')
  })
})
