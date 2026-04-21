/**
 * Per-model type-safety tests for Anthropic provider tools.
 *
 * Positive cases: each supported (model, tool) pair compiles cleanly.
 * Negative cases: unsupported (model, tool) pairs produce a `@ts-expect-error`.
 */
import { beforeAll, describe, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { anthropicText } from '../src'
import {
  bashTool,
  codeExecutionTool,
  computerUseTool,
  customTool,
  memoryTool,
  textEditorTool,
  webFetchTool,
  webSearchTool,
} from '../src/tools'
import type { TextActivityOptions } from '@tanstack/ai/adapters'

// Helper — keeps each `it` body to one call (test-hygiene Rule 1).
function typedTools<TAdapter extends ReturnType<typeof anthropicText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['ANTHROPIC_API_KEY'] = 'sk-test-dummy'
})

// Minimal user tool — always assignable regardless of model.
const userTool = toolDefinition({
  name: 'echo',
  description: 'echoes input',
  inputSchema: z.object({ msg: z.string() }),
}).server(async ({ msg }) => msg)

describe('Anthropic per-model tool gating', () => {
  it('claude-opus-4-6 accepts the full tool superset', () => {
    const adapter = anthropicText('claude-opus-4-6')
    typedTools(adapter, [
      userTool,
      webSearchTool({ name: 'web_search', type: 'web_search_20250305' }),
      webFetchTool(),
      codeExecutionTool({
        name: 'code_execution',
        type: 'code_execution_20250825',
      }),
      computerUseTool({
        type: 'computer_20250124',
        name: 'computer',
        display_width_px: 1024,
        display_height_px: 768,
      }),
      bashTool({ name: 'bash', type: 'bash_20250124' }),
      textEditorTool({
        type: 'text_editor_20250124',
        name: 'str_replace_editor',
      }),
      memoryTool(),
    ])
  })

  it('claude-3-haiku rejects every tool except web_search', () => {
    const adapter = anthropicText('claude-3-haiku')
    typedTools(adapter, [
      userTool,
      webSearchTool({ name: 'web_search', type: 'web_search_20250305' }),
      // @ts-expect-error - claude-3-haiku does not support web_fetch
      webFetchTool(),
      // @ts-expect-error - claude-3-haiku does not support code_execution
      codeExecutionTool({
        name: 'code_execution',
        type: 'code_execution_20250825',
      }),
      // @ts-expect-error - claude-3-haiku does not support computer_use
      computerUseTool({
        type: 'computer_20250124',
        name: 'computer',
        display_width_px: 1024,
        display_height_px: 768,
      }),
      // @ts-expect-error - claude-3-haiku does not support bash
      bashTool({ name: 'bash', type: 'bash_20250124' }),
      // @ts-expect-error - claude-3-haiku does not support text_editor
      textEditorTool({
        type: 'text_editor_20250124',
        name: 'str_replace_editor',
      }),
      // @ts-expect-error - claude-3-haiku does not support memory
      memoryTool(),
    ])
  })

  it('customTool is accepted on any model (returns plain Tool, not a branded ProviderTool)', () => {
    // Full-featured model
    const fullAdapter = anthropicText('claude-opus-4-6')
    typedTools(fullAdapter, [
      customTool(
        'lookup_user',
        'Look up a user by ID',
        z.object({ userId: z.number() }),
      ),
    ])

    // Restricted model — customTool must still compile without @ts-expect-error
    const restrictedAdapter = anthropicText('claude-3-haiku')
    typedTools(restrictedAdapter, [
      customTool(
        'lookup_user',
        'Look up a user by ID',
        z.object({ userId: z.number() }),
      ),
    ])
  })

  it('claude-3-5-haiku accepts only web tools', () => {
    const adapter = anthropicText('claude-3-5-haiku')
    typedTools(adapter, [
      userTool,
      webSearchTool({ name: 'web_search', type: 'web_search_20250305' }),
      webFetchTool(),
      // @ts-expect-error - claude-3-5-haiku does not support code_execution
      codeExecutionTool({
        name: 'code_execution',
        type: 'code_execution_20250825',
      }),
      // @ts-expect-error - claude-3-5-haiku does not support computer_use
      computerUseTool({
        type: 'computer_20250124',
        name: 'computer',
        display_width_px: 1024,
        display_height_px: 768,
      }),
      // @ts-expect-error - claude-3-5-haiku does not support bash
      bashTool({ name: 'bash', type: 'bash_20250124' }),
      // @ts-expect-error - claude-3-5-haiku does not support text_editor
      textEditorTool({
        type: 'text_editor_20250124',
        name: 'str_replace_editor',
      }),
      // @ts-expect-error - claude-3-5-haiku does not support memory
      memoryTool(),
    ])
  })
})
