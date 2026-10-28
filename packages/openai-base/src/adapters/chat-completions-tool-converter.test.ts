import { describe, expect, it } from 'vitest'
import { convertFunctionToolToChatCompletionsFormat } from './chat-completions-tool-converter'
import type { Tool } from '@tanstack/ai'

describe('chat-completions tool converter', () => {
  it('falls back from strict mode when an anyOf variant needs null widening', () => {
    const out = convertFunctionToolToChatCompletionsFormat(
      anyOfOptionalVariantTool,
    )

    expect(out.function.strict).toBe(false)
  })

  it('falls back from strict mode for boolean schema nodes', () => {
    const out = convertFunctionToolToChatCompletionsFormat(booleanSchemaTool)

    expect(out.function.strict).toBe(false)
    expect(out.function.parameters).toEqual(booleanSchemaTool.inputSchema)
  })

  it('keeps draft-07 tuple items as an array in strict mode', () => {
    const out = convertFunctionToolToChatCompletionsFormat(bboxTupleTool)

    expect(out.function.strict).toBe(true)
    expect(out.function.parameters).toMatchObject({
      properties: {
        bbox: {
          type: 'array',
          items: bboxItems,
        },
      },
    })
  })

  it('falls back from strict mode when prefixItems is present', () => {
    const out = convertFunctionToolToChatCompletionsFormat(prefixItemsTool)

    expect(out.function.strict).toBe(false)
    expect(out.function.parameters).toEqual(prefixItemsTool.inputSchema)
  })
})

const booleanSchemaInput = {
  type: 'object',
  properties: {},
  required: [],
}
Reflect.set(booleanSchemaInput.properties, 'acceptAnything', true)

const booleanSchemaTool = {
  name: 'accept_anything',
  description: 'Accept any value',
  inputSchema: booleanSchemaInput,
} satisfies Tool

const bboxItems = [
  { type: 'number', minimum: -180 },
  { type: 'number', minimum: -90 },
  { type: 'number', maximum: 180 },
  { type: 'number', maximum: 90 },
]

const bboxTupleTool: Tool = {
  name: 'set_bbox',
  description: 'Set a bounding box',
  inputSchema: {
    type: 'object',
    properties: {
      bbox: {
        type: 'array',
        items: bboxItems,
      },
    },
    required: ['bbox'],
  },
}

const prefixItemsTool: Tool = {
  name: 'set_pair',
  description: 'Set a prefix-item pair',
  inputSchema: {
    type: 'object',
    properties: {
      pair: {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
      },
    },
    required: ['pair'],
  },
}

const anyOfOptionalVariantTool: Tool = {
  name: 'store_variant',
  description: 'Store a union variant',
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
