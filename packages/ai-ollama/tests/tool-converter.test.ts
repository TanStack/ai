import { describe, expect, it } from 'vitest'
import { convertFunctionToolToAdapterFormat } from '../src/tools/function-tool'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import type { Tool } from '@tanstack/ai'

const baseTool: Tool = {
  name: 'getGuitars',
  description: 'Get guitar recommendations',
  inputSchema: {
    type: 'object',
    properties: { brand: { type: 'string' } },
    required: ['brand'],
  },
}

describe('convertFunctionToolToAdapterFormat', () => {
  it('maps a standard Tool into Ollamas function-tool envelope', () => {
    const converted = convertFunctionToolToAdapterFormat(baseTool)
    expect(converted.type).toBe('function')
    expect(converted.function.name).toBe('getGuitars')
    expect(converted.function.description).toBe('Get guitar recommendations')
    expect(converted.function.parameters).toEqual(baseTool.inputSchema)
  })

  it('supplies an empty object schema when tool.inputSchema is missing', () => {
    const converted = convertFunctionToolToAdapterFormat({
      name: 'noop',
      description: 'does nothing',
    } as Tool)
    expect(converted.function.parameters).toEqual({
      type: 'object',
      properties: {},
      required: [],
    })
  })

  it('passes through complex nested schemas without modification', () => {
    const complex: Tool = {
      name: 'complex',
      description: '',
      inputSchema: {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              arr: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }
    expect(
      convertFunctionToolToAdapterFormat(complex).function.parameters,
    ).toEqual(complex.inputSchema)
  })
})

describe('convertToolsToProviderFormat', () => {
  it('returns undefined for nullish input', () => {
    expect(convertToolsToProviderFormat(undefined)).toBeUndefined()
  })

  it('returns undefined for an empty array (Ollama expects undefined, not [])', () => {
    expect(convertToolsToProviderFormat([])).toBeUndefined()
  })

  it('converts each tool independently and preserves order', () => {
    const tools: Array<Tool> = [
      { name: 'first', description: 'one' },
      { name: 'second', description: 'two' },
      { name: 'third', description: 'three' },
    ]
    const converted = convertToolsToProviderFormat(tools)
    expect(converted).toHaveLength(3)
    expect(converted!.map((t) => t.function.name)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('delegates to convertFunctionToolToAdapterFormat (no special-casing today)', () => {
    const tools: Array<Tool> = [
      {
        name: 'web_search',
        description: 'Anthropic-style special tool name',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    ]
    const converted = convertToolsToProviderFormat(tools)
    // Ollama has no special tool types — everything is a function tool
    expect(converted![0]!.type).toBe('function')
    expect(converted![0]!.function.name).toBe('web_search')
  })
})
