import { describe, expect, it } from 'vitest'
import { convertFunctionToolToAdapterFormat } from './function-tool'

describe('convertFunctionToolToAdapterFormat', () => {
  it('preserves composed schemas under the non-strict fallback', () => {
    const inputSchema = {
      type: 'object',
      properties: {
        value: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
      required: [],
    }

    expect(
      convertFunctionToolToAdapterFormat({
        name: 'store_value',
        description: 'Store a value',
        inputSchema,
      }),
    ).toEqual({
      type: 'function',
      function: {
        name: 'store_value',
        description: 'Store a value',
        parameters: inputSchema,
        strict: false,
      },
    })
  })
})
