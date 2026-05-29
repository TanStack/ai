/**
 * Per-model type-safety tests for OpenAI provider tools.
 *
 * Positive cases: each supported (model, tool) pair compiles cleanly.
 * Negative cases: unsupported (model, tool) pairs produce a `@ts-expect-error`.
 */
import { beforeAll, describe, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { openaiText } from '../src'
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
import type { TextActivityOptions } from '@tanstack/ai/adapters'

// Helper — keeps each `it` body to one call (test-hygiene Rule 1).
function typedTools<TAdapter extends ReturnType<typeof openaiText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['OPENAI_API_KEY'] = 'sk-test-dummy'
})

// Minimal user tool — always assignable regardless of model.
const userTool = toolDefinition({
  name: 'echo',
  description: 'echoes input',
  inputSchema: z.object({ msg: z.string() }),
}).server(async ({ msg }) => msg)

describe('OpenAI per-model tool gating', () => {
  it('gpt-5.2 accepts the full tool superset', () => {
    const adapter = openaiText('gpt-5.2')
    typedTools(adapter, [
      userTool,
      webSearchTool({ type: 'web_search' }),
      webSearchPreviewTool({ type: 'web_search_preview' }),
      fileSearchTool({ type: 'file_search', vector_store_ids: ['vs_123'] }),
      imageGenerationTool({}),
      codeInterpreterTool({
        type: 'code_interpreter',
        container: { type: 'auto' },
      }),
      mcpTool({
        server_label: 'my-server',
        server_url: 'https://example.com/mcp',
      }),
      computerUseTool({
        type: 'computer_use_preview',
        display_height: 768,
        display_width: 1024,
        environment: 'linux',
      }),
      localShellTool(),
      shellTool(),
      applyPatchTool(),
    ])
  })

  it('gpt-3.5-turbo rejects every provider tool; user-defined tool is still accepted', () => {
    const adapter = openaiText('gpt-3.5-turbo')
    typedTools(adapter, [
      userTool,
      // @ts-expect-error - gpt-3.5-turbo does not support web_search
      webSearchTool({ type: 'web_search' }),
      // @ts-expect-error - gpt-3.5-turbo does not support web_search_preview
      webSearchPreviewTool({ type: 'web_search_preview' }),
      // @ts-expect-error - gpt-3.5-turbo does not support file_search
      fileSearchTool({ type: 'file_search', vector_store_ids: ['vs_123'] }),
      // @ts-expect-error - gpt-3.5-turbo does not support image_generation
      imageGenerationTool({}),
      // @ts-expect-error - gpt-3.5-turbo does not support code_interpreter
      codeInterpreterTool({
        type: 'code_interpreter',
        container: { type: 'auto' },
      }),
      // @ts-expect-error - gpt-3.5-turbo does not support mcp
      mcpTool({
        server_label: 'my-server',
        server_url: 'https://example.com/mcp',
      }),
      // @ts-expect-error - gpt-3.5-turbo does not support computer_use
      computerUseTool({
        type: 'computer_use_preview',
        display_height: 768,
        display_width: 1024,
        environment: 'linux',
      }),
      // @ts-expect-error - gpt-3.5-turbo does not support local_shell
      localShellTool(),
      // @ts-expect-error - gpt-3.5-turbo does not support shell
      shellTool(),
      // @ts-expect-error - gpt-3.5-turbo does not support apply_patch
      applyPatchTool(),
    ])
  })

  it('customTool is accepted on any model (returns plain Tool, not a branded ProviderTool)', () => {
    // Full-featured model
    const fullAdapter = openaiText('gpt-5.2')
    typedTools(fullAdapter, [
      customTool({
        type: 'custom',
        name: 'lookup_order',
        description: 'Look up an order',
      }),
    ])

    // Restricted model — customTool must still compile without @ts-expect-error
    const restrictedAdapter = openaiText('gpt-3.5-turbo')
    typedTools(restrictedAdapter, [
      customTool({
        type: 'custom',
        name: 'lookup_order',
        description: 'Look up an order',
      }),
    ])
  })

  it('gpt-4o accepts web_search, file_search, image_generation, code_interpreter, mcp but rejects the rest', () => {
    const adapter = openaiText('gpt-4o')
    typedTools(adapter, [
      userTool,
      webSearchTool({ type: 'web_search' }),
      fileSearchTool({ type: 'file_search', vector_store_ids: ['vs_456'] }),
      imageGenerationTool({}),
      codeInterpreterTool({
        type: 'code_interpreter',
        container: { type: 'auto' },
      }),
      mcpTool({
        server_label: 'my-server',
        server_url: 'https://example.com/mcp',
      }),
      // @ts-expect-error - gpt-4o does not support web_search_preview
      webSearchPreviewTool({ type: 'web_search_preview' }),
      // @ts-expect-error - gpt-4o does not support computer_use
      computerUseTool({
        type: 'computer_use_preview',
        display_height: 768,
        display_width: 1024,
        environment: 'linux',
      }),
      // @ts-expect-error - gpt-4o does not support local_shell
      localShellTool(),
      // @ts-expect-error - gpt-4o does not support shell
      shellTool(),
      // @ts-expect-error - gpt-4o does not support apply_patch
      applyPatchTool(),
    ])
  })
})
