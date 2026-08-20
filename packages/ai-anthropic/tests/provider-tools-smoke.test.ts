/**
 * Runtime smoke test for provider tool factories.
 *
 * Verifies:
 *   1. Factories are importable from the package-internal tools path
 *      (mirroring the public `/tools` subpath consumers will use).
 *   2. Each factory brands the tool with `metadata.__kind`.
 *   3. `convertToolsToProviderFormat` transforms those outputs into the SDK shape.
 */
import { describe, expect, it } from 'vitest'
import {
  bashTool,
  codeExecutionTool,
  computerUseTool,
  memoryTool,
  textEditorTool,
  webFetchTool,
  webSearchTool,
} from '../src/tools'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import { DuplicateToolNameError } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

function expectBrandedFactory(tool: Tool, name: string, kind: string) {
  expect(tool.name).toBe(name)
  expect(tool).toHaveProperty('description')
  expect(tool.metadata).toMatchObject({ __kind: kind })
}

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

describe('Anthropic provider tool factories — runtime shape', () => {
  it('webSearchTool produces a Tool-shaped object', () => {
    expectBrandedFactory(
      webSearchTool({
        name: 'web_search',
        type: 'web_search_20250305',
      }),
      'web_search',
      'anthropic.web_search',
    )
  })

  it('codeExecutionTool produces a Tool-shaped object', () => {
    expectBrandedFactory(
      codeExecutionTool({
        name: 'code_execution',
        type: 'code_execution_20250825',
      }),
      'code_execution',
      'anthropic.code_execution',
    )
  })

  it('computerUseTool produces a Tool-shaped object', () => {
    expectBrandedFactory(
      computerUseTool({
        type: 'computer_20250124',
        name: 'computer',
        display_width_px: 1024,
        display_height_px: 768,
      }),
      'computer',
      'anthropic.computer_use',
    )
  })

  it('bashTool produces a Tool-shaped object', () => {
    expectBrandedFactory(
      bashTool({ name: 'bash', type: 'bash_20250124' }),
      'bash',
      'anthropic.bash',
    )
  })

  it('textEditorTool produces a Tool-shaped object', () => {
    expectBrandedFactory(
      textEditorTool({
        type: 'text_editor_20250124',
        name: 'str_replace_editor',
      }),
      'str_replace_editor',
      'anthropic.text_editor',
    )
  })

  it('webFetchTool produces a Tool-shaped object', () => {
    expectBrandedFactory(webFetchTool(), 'web_fetch', 'anthropic.web_fetch')
  })

  it('memoryTool produces a Tool-shaped object', () => {
    expectBrandedFactory(memoryTool(), 'memory', 'anthropic.memory')
  })
})

describe('convertToolsToProviderFormat — end-to-end shape', () => {
  it('forwards web search options from the factory config', () => {
    const [converted] = convertToolsToProviderFormat([
      webSearchTool({
        name: 'web_search',
        type: 'web_search_20250305',
        max_uses: 2,
        allowed_domains: ['example.com'],
      }),
    ])
    expect(converted).toEqual({
      name: 'web_search',
      type: 'web_search_20250305',
      max_uses: 2,
      allowed_domains: ['example.com'],
    })
  })

  it('keeps provider identity through a plain-data round trip', () => {
    const parsed: unknown = JSON.parse(
      JSON.stringify(
        webSearchTool({
          name: 'web_search',
          type: 'web_search_20250305',
        }),
      ),
    )
    if (!isRoundTrippedTool(parsed)) {
      throw new Error('round-tripped tool is not a Tool-shaped object')
    }

    expect(convertToolsToProviderFormat([parsed])).toEqual([
      {
        name: 'web_search',
        type: 'web_search_20250305',
      },
    ])
  })

  it('converts multiple provider tools in one call', () => {
    const converted = convertToolsToProviderFormat([
      webSearchTool({ name: 'web_search', type: 'web_search_20250305' }),
      webFetchTool(),
      codeExecutionTool({
        name: 'code_execution',
        type: 'code_execution_20250825',
      }),
      bashTool({ name: 'bash', type: 'bash_20250124' }),
      computerUseTool({
        type: 'computer_20250124',
        name: 'computer',
        display_width_px: 1024,
        display_height_px: 768,
      }),
      memoryTool(),
      textEditorTool({
        type: 'text_editor_20250124',
        name: 'str_replace_editor',
      }),
    ])
    expect(JSON.stringify(converted)).not.toContain('__kind')
    expect(converted).toEqual([
      { name: 'web_search', type: 'web_search_20250305' },
      { name: 'web_fetch', type: 'web_fetch_20250910' },
      { name: 'code_execution', type: 'code_execution_20250825' },
      { name: 'bash', type: 'bash_20250124' },
      {
        name: 'computer',
        type: 'computer_20250124',
        display_width_px: 1024,
        display_height_px: 768,
      },
      { type: 'memory_20250818' },
      { type: 'text_editor_20250124', name: 'str_replace_editor' },
    ])
  })

  it('throws when a factory tool and a custom tool share a name', () => {
    expect(() =>
      convertToolsToProviderFormat([
        webSearchTool({ name: 'web_search', type: 'web_search_20250305' }),
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

  it.each([
    'bash',
    'code_execution',
    'computer',
    'memory',
    'str_replace_editor',
    'web_fetch',
    'web_search',
  ])('keeps an ordinary function named %s as a custom tool', (name) => {
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
      name,
      type: 'custom',
      description: 'Run an application function',
      input_schema: {
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    })
  })
})
