import { describe, expect, it } from 'vitest'
import {
  codeExecutionTool,
  computerUseTool,
  fileSearchTool,
  googleMapsTool,
  googleSearchRetrievalTool,
  googleSearchTool,
  urlContextTool,
} from './index'
import { convertToolsToProviderFormat } from './tool-converter'
import type { Tool } from '@tanstack/ai'

const PROVIDER_TOOL_NAMES = [
  'code_execution',
  'computer_use',
  'file_search',
  'google_maps',
  'google_search',
  'google_search_retrieval',
  'url_context',
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

  it('converts every factory tool without leaking its runtime marker', () => {
    const converted = convertToolsToProviderFormat([
      codeExecutionTool(),
      computerUseTool({}),
      fileSearchTool({ fileSearchStoreNames: [] }),
      googleMapsTool(),
      googleSearchTool(),
      googleSearchRetrievalTool(),
      urlContextTool(),
    ])

    expect(converted).toHaveLength(PROVIDER_TOOL_NAMES.length)
    expect(JSON.stringify(converted)).not.toContain('__kind')
  })

  it('keeps provider identity through a plain-data round trip', () => {
    const tool = JSON.parse(JSON.stringify(googleSearchTool())) as Tool

    expect(convertToolsToProviderFormat([tool])).toEqual([{ googleSearch: {} }])
  })
})
