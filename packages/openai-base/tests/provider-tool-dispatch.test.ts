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

const FACTORY_CASES = [
  {
    name: 'apply_patch',
    kind: 'openai.apply_patch',
    tool: applyPatchTool(),
    wire: { type: 'apply_patch' },
  },
  {
    name: 'code_interpreter',
    kind: 'openai.code_interpreter',
    tool: codeInterpreterTool({
      type: 'code_interpreter',
      container: { type: 'auto' },
    }),
    wire: { type: 'code_interpreter' },
  },
  {
    name: 'computer_use_preview',
    kind: 'openai.computer_use',
    tool: computerUseTool({
      type: 'computer_use_preview',
      display_height: 768,
      display_width: 1024,
      environment: 'linux',
    }),
    wire: {
      type: 'computer_use_preview',
      display_height: 768,
      display_width: 1024,
      environment: 'linux',
    },
  },
  {
    name: 'custom',
    kind: 'openai.custom',
    tool: customTool({
      type: 'custom',
      name: 'lookup_order',
      description: 'Look up an order',
    }),
    wire: {
      type: 'custom',
      name: 'lookup_order',
      description: 'Look up an order',
    },
  },
  {
    name: 'file_search',
    kind: 'openai.file_search',
    tool: fileSearchTool({
      type: 'file_search',
      vector_store_ids: ['vs_123'],
    }),
    wire: { type: 'file_search', vector_store_ids: ['vs_123'] },
  },
  {
    name: 'image_generation',
    kind: 'openai.image_generation',
    tool: imageGenerationTool({}),
    wire: { type: 'image_generation' },
  },
  {
    name: 'local_shell',
    kind: 'openai.local_shell',
    tool: localShellTool(),
    wire: { type: 'local_shell' },
  },
  {
    name: 'mcp',
    kind: 'openai.mcp',
    tool: mcpTool({
      server_label: 'my-server',
      server_url: 'https://example.com/mcp',
    }),
    wire: {
      type: 'mcp',
      server_label: 'my-server',
      server_url: 'https://example.com/mcp',
    },
  },
  {
    name: 'shell',
    kind: 'openai.shell',
    tool: shellTool(),
    wire: { type: 'shell' },
  },
  {
    name: 'web_search_preview',
    kind: 'openai.web_search_preview',
    tool: webSearchPreviewTool({ type: 'web_search_preview' }),
    wire: { type: 'web_search_preview' },
  },
  {
    name: 'web_search',
    kind: 'openai.web_search',
    tool: webSearchTool({ type: 'web_search' }),
    wire: { type: 'web_search' },
  },
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

  it.each(FACTORY_CASES)(
    'converts $name to the native wire shape',
    ({ kind, tool, wire }) => {
      expect(tool.metadata).toMatchObject({ __kind: kind })
      const [converted] = convertToolsToProviderFormat([tool])
      expect(converted).toMatchObject(wire)
      expect(JSON.stringify(converted)).not.toContain('__kind')
    },
  )

  it('throws when a factory tool and a custom tool share a name', () => {
    expect(() =>
      convertToolsToProviderFormat([
        webSearchTool({ type: 'web_search' }),
        {
          name: 'web_search',
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
    const parsed: unknown = JSON.parse(
      JSON.stringify(webSearchTool({ type: 'web_search' })),
    )
    if (!isRoundTrippedTool(parsed)) {
      throw new Error('round-tripped tool is not a Tool-shaped object')
    }

    expect(convertToolsToProviderFormat([parsed])).toEqual([
      { type: 'web_search' },
    ])
  })
})
