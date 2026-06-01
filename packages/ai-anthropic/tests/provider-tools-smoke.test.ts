/**
 * Runtime smoke test for provider tool factories.
 *
 * Verifies:
 *   1. Factories are importable from the package-internal tools path
 *      (mirroring the public `/tools` subpath consumers will use).
 *   2. Each factory produces a runtime shape with `name`, `description`, `metadata`.
 *   3. `convertToolsToProviderFormat` transforms those outputs into the SDK shape.
 */
import { describe, it, expect } from 'vitest'
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
import type { Tool } from '@tanstack/ai'

describe('Anthropic provider tool factories — runtime shape', () => {
  it('webSearchTool produces a Tool-shaped object', () => {
    const tool = webSearchTool({
      name: 'web_search',
      type: 'web_search_20250305',
    })
    expect(tool.name).toBe('web_search')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })

  it('codeExecutionTool produces a Tool-shaped object', () => {
    const tool = codeExecutionTool({
      name: 'code_execution',
      type: 'code_execution_20250825',
    })
    expect(tool.name).toBe('code_execution')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })

  it('computerUseTool produces a Tool-shaped object', () => {
    const tool = computerUseTool({
      type: 'computer_20250124',
      name: 'computer',
      display_width_px: 1024,
      display_height_px: 768,
    })
    expect(tool.name).toBe('computer')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })

  it('bashTool produces a Tool-shaped object', () => {
    const tool = bashTool({ name: 'bash', type: 'bash_20250124' })
    expect(tool.name).toBe('bash')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })

  it('textEditorTool produces a Tool-shaped object', () => {
    const tool = textEditorTool({
      type: 'text_editor_20250124',
      name: 'str_replace_editor',
    })
    expect(tool.name).toBe('str_replace_editor')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })

  it('webFetchTool produces a Tool-shaped object', () => {
    const tool = webFetchTool()
    expect(tool.name).toBe('web_fetch')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })

  it('memoryTool produces a Tool-shaped object', () => {
    const tool = memoryTool()
    expect(tool.name).toBe('memory')
    expect(tool).toHaveProperty('description')
    expect(tool).toHaveProperty('metadata')
  })
})

describe('convertToolsToProviderFormat — end-to-end shape', () => {
  it('converts webSearchTool output to the SDK web_search shape', () => {
    const [converted] = convertToolsToProviderFormat([
      webSearchTool({
        name: 'web_search',
        type: 'web_search_20250305',
        max_uses: 2,
      }) as unknown as Tool,
    ])
    expect(converted).toMatchObject({
      name: 'web_search',
      type: 'web_search_20250305',
    })
  })

  it('converts multiple provider tools in one call', () => {
    const converted = convertToolsToProviderFormat([
      webSearchTool({ name: 'web_search', type: 'web_search_20250305' }),
      codeExecutionTool({
        name: 'code_execution',
        type: 'code_execution_20250825',
      }),
      bashTool({ name: 'bash', type: 'bash_20250124' }),
    ] as unknown as Tool[])
    expect(converted).toHaveLength(3)
    const names = converted.map((t) => ('name' in t ? t.name : undefined))
    expect(names).toContain('web_search')
    expect(names).toContain('code_execution')
    expect(names).toContain('bash')
  })
})
