import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { undoNullWidening } from '@tanstack/ai-utils'
import { convertSchemaForStructuredOutput } from '../src/activities/chat/tools/schema-converter'

const bboxItems = [
  { type: 'number', minimum: -180 },
  { type: 'number', minimum: -90 },
  { type: 'number', maximum: 180 },
  { type: 'number', maximum: 90 },
]

describe('structured-output tuple items', () => {
  it('keeps every positional schema on an array property', () => {
    const { jsonSchema } = convertSchemaForStructuredOutput({
      type: 'object',
      properties: {
        bbox: { type: 'array', items: bboxItems },
      },
      required: ['bbox'],
    })

    expect(jsonSchema?.properties?.bbox?.items).toEqual(bboxItems)
  })

  it('records a positional map for a tuple of optional objects', () => {
    const { jsonSchema, nullWideningMap } = convertSchemaForStructuredOutput({
      type: 'array',
      items: [
        {
          type: 'object',
          properties: { west: { type: 'string' } },
          required: [],
        },
        {
          type: 'object',
          properties: { east: { type: 'string' } },
          required: [],
        },
      ],
    })

    expect(Array.isArray(jsonSchema?.items)).toBe(true)
    expect(nullWideningMap).toEqual({
      items: [
        { properties: { west: { widened: true } } },
        { properties: { east: { widened: true } } },
      ],
    })
  })
})

describe('structured-output homogeneous array maps', () => {
  it('un-widens every element, not only index 0', () => {
    const outputSchema = z.object({
      list: z.array(z.object({ a: z.string().optional() })),
    })

    const { nullWideningMap } = convertSchemaForStructuredOutput(outputSchema)
    expect(
      undoNullWidening(
        { list: [{ a: null }, { a: null }, { a: null }] },
        nullWideningMap,
      ),
    ).toEqual({ list: [{}, {}, {}] })
  })
})
