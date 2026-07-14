import { describe, expect, it } from 'vitest'
import {
  applyPatchTool,
  codeInterpreterTool,
  computerUseTool,
  customTool,
  fileSearchTool,
  imageGenerationTool,
  localShellTool,
  mcpTool,
  shellTool,
  webSearchPreviewTool,
  webSearchTool,
} from '../src/tools'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import type { Tool } from '@tanstack/ai'

const PROVIDER_TOOL_NAMES = [
  'apply_patch',
  'code_interpreter',
  'computer_use_preview',
  'custom',
  'file_search',
  'image_generation',
  'local_shell',
  'mcp',
  'shell',
  'web_search_preview',
  'web_search',
] as const

describe('OpenAI provider tool dispatch', () => {
  it.each(PROVIDER_TOOL_NAMES)(
    'keeps an ordinary function named %s as a function tool',
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

      expect(converted).toMatchObject({ type: 'function', name })
    },
  )

  it('converts every factory tool without leaking its runtime marker', () => {
    const converted = convertToolsToProviderFormat([
      applyPatchTool(),
      codeInterpreterTool({
        type: 'code_interpreter',
        container: { type: 'auto' },
      }),
      computerUseTool({
        type: 'computer_use_preview',
        display_height: 768,
        display_width: 1024,
        environment: 'linux',
      }),
      customTool({
        type: 'custom',
        name: 'lookup_order',
        description: 'Look up an order',
      }),
      fileSearchTool({
        type: 'file_search',
        vector_store_ids: ['vs_123'],
      }),
      imageGenerationTool({}),
      localShellTool(),
      mcpTool({
        server_label: 'my-server',
        server_url: 'https://example.com/mcp',
      }),
      shellTool(),
      webSearchPreviewTool({ type: 'web_search_preview' }),
      webSearchTool({ type: 'web_search' }),
    ])

    expect(converted).toHaveLength(PROVIDER_TOOL_NAMES.length)
    expect(JSON.stringify(converted)).not.toContain('__kind')
  })

  it('keeps provider identity through a plain-data round trip', () => {
    const tool = JSON.parse(
      JSON.stringify(webSearchTool({ type: 'web_search' })),
    ) as Tool

    expect(convertToolsToProviderFormat([tool])).toEqual([
      { type: 'web_search' },
    ])
  })
})
