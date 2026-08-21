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
