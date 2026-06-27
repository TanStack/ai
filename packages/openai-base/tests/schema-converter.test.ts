import { describe, expect, it } from 'vitest'
import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
} from '../src/utils/schema-converter'

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

  it('should handle boolean items without crashing or recursing', () => {
    const schema = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: false,
        },
        listTrue: {
          type: 'array',
          items: true,
        },
      },
      required: ['list', 'listTrue'],
    }

    const result: any = makeStructuredOutputCompatible(schema, ['list', 'listTrue'])
    expect(result.properties.list.items).toBe(false)
    expect(result.properties.listTrue.items).toBe(true)

    // Direct top-level array schema with boolean items
    const topLevelArrayFalse = {
      type: 'array',
      items: false,
    }
    const resultFalse: any = makeStructuredOutputCompatible(topLevelArrayFalse)
    expect(resultFalse.items).toBe(false)

    const topLevelArrayTrue = {
      type: 'array',
      items: true,
    }
    const resultTrue: any = makeStructuredOutputCompatible(topLevelArrayTrue)
    expect(resultTrue.items).toBe(true)

    // Tuple-style arrays
    const tupleSchema = {
      type: 'object',
      properties: {
        tupleField: {
          type: 'array',
          items: [
            { type: 'string' },
            { type: 'object', properties: { nestedVal: { type: 'number' } } },
          ],
        },
      },
      required: ['tupleField'],
    }
    const resultTuple: any = makeStructuredOutputCompatible(tupleSchema, ['tupleField'])
    expect(resultTuple.properties.tupleField.items).toBeInstanceOf(Array)
    expect(resultTuple.properties.tupleField.items[0].type).toBe('string')
    expect(resultTuple.properties.tupleField.items[1].properties).toBeDefined()
    expect(resultTuple.properties.tupleField.items[1].additionalProperties).toBe(false)
  })

  it('should handle tuple items with mixed boolean and object elements', () => {
    const schema = {
      type: 'object',
      properties: {
        mixed: {
          type: 'array',
          items: [
            false,
            { type: 'object', properties: { val: { type: 'number' } }, required: ['val'] },
            true,
            { type: 'string' },
          ],
        },
      },
      required: ['mixed'],
    }
    const result: any = makeStructuredOutputCompatible(schema, ['mixed'])
    expect(result.properties.mixed.items).toBeInstanceOf(Array)
    expect(result.properties.mixed.items[0]).toBe(false)
    expect(result.properties.mixed.items[1].additionalProperties).toBe(false)
    expect(result.properties.mixed.items[1].properties.val.type).toBe('number')
    expect(result.properties.mixed.items[2]).toBe(true)
    expect(result.properties.mixed.items[3].type).toBe('string')
  })

  it('should handle tuple items where all elements are boolean', () => {
    const schema = {
      type: 'object',
      properties: {
        allBool: {
          type: 'array',
          items: [false, true, false],
        },
      },
      required: ['allBool'],
    }
    const result: any = makeStructuredOutputCompatible(schema, ['allBool'])
    expect(result.properties.allBool.items).toBeInstanceOf(Array)
    expect(result.properties.allBool.items).toEqual([false, true, false])
  })

  it('should handle top-level array with tuple items containing booleans', () => {
    const topLevelTuple = {
      type: 'array',
      items: [false, { type: 'object', properties: { x: { type: 'string' } } }, true],
    }
    const result: any = makeStructuredOutputCompatible(topLevelTuple)
    expect(result.items).toBeInstanceOf(Array)
    expect(result.items[0]).toBe(false)
    expect(result.items[1].additionalProperties).toBe(false)
    expect(result.items[2]).toBe(true)
  })

  it('should handle top-level array with single object items', () => {
    const topLevelArray = {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    }
    const result: any = makeStructuredOutputCompatible(topLevelArray)
    expect(result.items.additionalProperties).toBe(false)
    expect(result.items.required).toEqual(['id'])
  })

  it('should handle optional array with boolean items without crashing on null-widening', () => {
    const schema = {
      type: 'object',
      properties: {
        optFalseItems: { type: 'array', items: false },
        optTrueItems: { type: 'array', items: true },
      },
      required: [],
    }
    const result: any = makeStructuredOutputCompatible(schema, [])
    // Optional fields should have type widened to include null
    expect(result.properties.optFalseItems.type).toEqual(['array', 'null'])
    expect(result.properties.optFalseItems.items).toBe(false)
    expect(result.properties.optTrueItems.type).toEqual(['array', 'null'])
    expect(result.properties.optTrueItems.items).toBe(true)
  })
})

describe('isStrictModeCompatible', () => {
  it('returns true for a plain object schema in the strict subset', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      }),
    ).toBe(true)
  })

  it('returns true for nested objects, arrays, and anyOf (all strict-supported)', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                v: { anyOf: [{ type: 'string' }, { type: 'number' }] },
              },
            },
          },
        },
      }),
    ).toBe(true)
  })

  it.each(['oneOf', 'allOf', 'not'])(
    'returns false when a combinator keyword (%s) appears anywhere',
    (keyword) => {
      expect(
        isStrictModeCompatible({
          type: 'object',
          properties: {
            value: { [keyword]: [{ type: 'string' }] },
          },
        }),
      ).toBe(false)
    },
  )

  it('returns false for schemas using $ref / $defs (references escape strict normalization)', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: { user: { $ref: '#/$defs/user' } },
        $defs: {
          user: { type: 'object', properties: { id: { type: 'string' } } },
        },
      }),
    ).toBe(false)
  })

  it('detects unsupported keywords nested deep in the tree', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: {
          a: {
            type: 'object',
            properties: {
              b: { type: 'array', items: { oneOf: [{ type: 'string' }] } },
            },
          },
        },
      }),
    ).toBe(false)
  })

  it('handles non-object input without throwing', () => {
    expect(isStrictModeCompatible(undefined)).toBe(true)
    expect(isStrictModeCompatible(null)).toBe(true)
    expect(isStrictModeCompatible('x')).toBe(true)
  })

  it('returns false when a property is typeless (e.g. z.any() -> {})', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: { payload: {} },
        required: ['payload'],
      }),
    ).toBe(false)
  })

  it('returns false for a typeless node with only metadata (no type keyword)', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: { payload: { description: 'anything' } },
      }),
    ).toBe(false)
  })

  it('returns false for a typeless array items schema', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: { list: { type: 'array', items: {} } },
      }),
    ).toBe(false)
  })

  it('returns false for a typeless anyOf variant', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: { v: { anyOf: [{ type: 'string' }, {}] } },
      }),
    ).toBe(false)
  })

  it('detects a typeless property nested deep in the tree', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: {
          a: {
            type: 'object',
            properties: {
              b: {
                type: 'array',
                items: { type: 'object', properties: { c: {} } },
              },
            },
          },
        },
      }),
    ).toBe(false)
  })

  it('treats enum / const properties as typed (strict-compatible)', () => {
    expect(
      isStrictModeCompatible({
        type: 'object',
        properties: {
          color: { enum: ['red', 'blue'] },
          tag: { const: 'x' },
        },
      }),
    ).toBe(true)
  })

  it('does not flag an empty properties map as typeless', () => {
    expect(
      isStrictModeCompatible({ type: 'object', properties: {}, required: [] }),
    ).toBe(true)
  })
})
