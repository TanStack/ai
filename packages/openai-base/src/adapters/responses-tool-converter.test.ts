import { describe, expect, it } from 'vitest'
import { convertFunctionToolToResponsesFormat } from './responses-tool-converter'
import type { Tool } from '@tanstack/ai'

describe('responses tool converter', () => {
  it('falls back from strict mode when an anyOf variant needs null widening', () => {
    const out = convertFunctionToolToResponsesFormat(anyOfOptionalVariantTool)

    expect(out.strict).toBe(false)
    expect(out.parameters).toMatchObject({
      properties: {
        value: {
          anyOf: [
            { required: ['kind'] },
            { required: ['kind', 'note'] },
          ],
        },
      },
    })
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
