import { describe, expect, it } from 'vitest'
import { createToolInputNormalizer } from '../src/utils/tool-input-normalizer'
import type { Tool } from '@tanstack/ai'

describe('createToolInputNormalizer', () => {
  it('leaves non-strict tool inputs unchanged', () => {
    const tool: Tool = {
      name: 'non_strict',
      description: 'Uses a schema outside the strict subset',
      inputSchema: {
        type: 'object',
        properties: { optional: { type: 'string' } },
        oneOf: [{ required: ['optional'] }, { required: [] }],
      },
    }
    const normalize = createToolInputNormalizer([tool])
    const input = { optional: null }

    expect(normalize(tool.name, input)).toBe(input)
  })

  it('does not guess when public tool names are ambiguous', () => {
    const tools: Array<Tool> = [
      {
        name: 'duplicate',
        description: 'First tool',
        inputSchema: {
          type: 'object',
          properties: { firstOptional: { type: 'string' } },
        },
      },
      {
        name: 'duplicate',
        description: 'Second tool',
        inputSchema: {
          type: 'object',
          properties: { secondOptional: { type: 'string' } },
        },
      },
    ]
    const normalize = createToolInputNormalizer(tools)
    const input = { firstOptional: null, secondOptional: null }

    expect(normalize('duplicate', input)).toBe(input)
  })
})
