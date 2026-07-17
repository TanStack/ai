import { describe, expect, it } from 'vitest'
import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { Tool } from '@tanstack/ai'

describe('function-tool adapter converter', () => {
  it('falls back from strict mode when an anyOf variant needs null widening', () => {
    const out = convertFunctionToolToAdapterFormat(anyOfOptionalVariantTool)

    expect(out.strict).toBe(false)
  })
})

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
