import { describe, expect, it } from 'vitest'
import {
  codeExecutionTool,
  computerUseTool,
  fileSearchTool,
  googleMapsTool,
  googleSearchRetrievalTool,
  googleSearchTool,
  urlContextTool,
} from '../src/tools'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import { DuplicateToolNameError } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

function isRoundTrippedTool(value: unknown): value is Tool {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'description' in value &&
    typeof value.description === 'string'
  )
}

const PROVIDER_TOOL_NAMES = [
  'code_execution',
  'computer_use',
  'file_search',
  'google_maps',
  'google_search',
  'google_search_retrieval',
  'url_context',
] as const

const FACTORY_CASES = [
  {
    name: 'code_execution',
    kind: 'gemini.code_execution',
    tool: codeExecutionTool(),
    wire: { codeExecution: {} },
  },
  {
    name: 'computer_use',
    kind: 'gemini.computer_use',
    tool: computerUseTool({}),
    wire: { computerUse: {} },
  },
  {
    name: 'file_search',
    kind: 'gemini.file_search',
    tool: fileSearchTool({ fileSearchStoreNames: [] }),
    wire: { fileSearch: { fileSearchStoreNames: [] } },
  },
  {
    name: 'google_maps',
    kind: 'gemini.google_maps',
    tool: googleMapsTool(),
    wire: { googleMaps: {} },
  },
  {
    name: 'google_search',
    kind: 'gemini.google_search',
    tool: googleSearchTool(),
    wire: { googleSearch: {} },
  },
  {
    name: 'google_search_retrieval',
    kind: 'gemini.google_search_retrieval',
    tool: googleSearchRetrievalTool(),
    wire: { googleSearchRetrieval: {} },
  },
  {
    name: 'url_context',
    kind: 'gemini.url_context',
    tool: urlContextTool(),
    wire: { urlContext: {} },
  },
] as const

describe('Gemini provider tool dispatch', () => {
  it.each(PROVIDER_TOOL_NAMES)(
    'keeps an ordinary function named %s as a function declaration',
    (name) => {
      const [converted] = convertToolsToProviderFormat([
        {
          name,
          description: 'Run an application function',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        } satisfies Tool,
      ])

      expect(converted).toMatchObject({
        functionDeclarations: [{ name }],
      })
    },
  )

  it.each(FACTORY_CASES)(
    'converts $name to the native wire shape',
    ({ kind, tool, wire }) => {
      expect(tool.metadata).toMatchObject({ __kind: kind })
      const [converted] = convertToolsToProviderFormat([tool])
      expect(converted).toEqual(wire)
      expect(JSON.stringify(converted)).not.toContain('__kind')
    },
  )

  it('throws when a factory tool and a custom tool share a name', () => {
    expect(() =>
      convertToolsToProviderFormat([
        googleSearchTool(),
        {
          name: 'google_search',
          description: 'Search application data',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        } satisfies Tool,
      ]),
    ).toThrow(DuplicateToolNameError)
  })

  it('keeps provider identity through a plain-data round trip', () => {
    const parsed: unknown = JSON.parse(JSON.stringify(googleSearchTool()))
    if (!isRoundTrippedTool(parsed)) {
      throw new Error('round-tripped tool is not a Tool-shaped object')
    }

    expect(convertToolsToProviderFormat([parsed])).toEqual([
      { googleSearch: {} },
    ])
  })
})
