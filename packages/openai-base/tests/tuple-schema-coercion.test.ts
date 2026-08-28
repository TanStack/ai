import { describe, expect, it } from 'vitest'
import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
  makeStructuredOutputCompatibleWithMap,
} from '../src/utils/schema-converter'

const bboxItems = [
  { type: 'number', minimum: -180 },
  { type: 'number', minimum: -90 },
  { type: 'number', maximum: 180 },
  { type: 'number', maximum: 90 },
]

describe('draft-07 tuple items', () => {
  it('keeps per-position bbox constraints instead of spreading items into a numeric-keyed object', () => {
    const result = makeStructuredOutputCompatible({
      type: 'object',
      properties: {
        bbox: {
          type: 'array',
          items: bboxItems,
          additionalItems: false,
        },
      },
      required: ['bbox'],
    })

    const items = result.properties.bbox.items
    expect(Array.isArray(items)).toBe(true)
    expect(items).toEqual(bboxItems)
    expect(result.properties.bbox.additionalItems).toBe(false)
  })

  it('keeps a top-level tuple items array as an array', () => {
    const result = makeStructuredOutputCompatible({
      type: 'array',
      items: bboxItems,
    })

    expect(Array.isArray(result.items)).toBe(true)
    expect(result.items).toEqual(bboxItems)
  })

  it('keeps boolean tuple entries and aligns null-widening maps by index', () => {
    const { schema, nullWideningMap } = makeStructuredOutputCompatibleWithMap({
      type: 'array',
      items: [
        false,
        {
          type: 'object',
          properties: { label: { type: 'string' } },
          required: [],
        },
      ],
    })

    expect(schema.items[0]).toBe(false)
    expect(schema.items[1].additionalProperties).toBe(false)
    expect(nullWideningMap).toEqual({
      items: [{}, { properties: { label: { widened: true } } }],
    })
  })

  it('still uses a single items map for a homogeneous array', () => {
    const { nullWideningMap } = makeStructuredOutputCompatibleWithMap({
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' } },
            required: [],
          },
        },
      },
      required: ['list'],
    })

    expect(nullWideningMap).toEqual({
      properties: {
        list: {
          items: { properties: { label: { widened: true } } },
        },
      },
    })
  })
})

describe('prefixItems strict gate', () => {
  it('rejects prefixItems so OpenAI tools fall back to strict: false', () => {
    expect(
      isStrictModeCompatible({
        type: 'array',
        prefixItems: [{ type: 'string' }],
      }),
    ).toBe(false)
  })
})
