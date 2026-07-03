/**
 * Per-model type-safety tests for Anthropic provider tools.
 *
 * Positive cases: each supported (model, tool) pair compiles cleanly.
 * Negative cases: unsupported (model, tool) pairs produce a `@ts-expect-error`.
 */
import { beforeAll, describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { ANTHROPIC_MODELS, anthropicText } from '../src'
import type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicChatModelToolCapabilitiesByName,
  AnthropicModelInputModalitiesByName,
} from '../src'
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

  it('claude-sonnet-5 accepts the full tool superset', () => {
    const adapter = anthropicText('claude-sonnet-5')
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

  it('claude-fable-5 accepts the full tool superset', () => {
    const adapter = anthropicText('claude-fable-5')
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

  it('customTool is accepted on any model (returns plain Tool, not a branded ProviderTool)', () => {
    const fullAdapter = anthropicText('claude-opus-4-6')
    typedTools(fullAdapter, [
      customTool(
        'lookup_user',
        'Look up a user by ID',
        z.object({ userId: z.number() }),
      ),
    ])

    const modernAdapter = anthropicText('claude-fable-5')
    typedTools(modernAdapter, [
      customTool(
        'lookup_user',
        'Look up a user by ID',
        z.object({ userId: z.number() }),
      ),
    ])
  })

  it('every registered model has a tool-capabilities map entry (no silent fallback to readonly [])', () => {
    // If a model is added to ANTHROPIC_MODELS but not to the capability map,
    // ResolveToolCapabilities falls back to `readonly []` and every provider
    // tool stops type-checking on that model. This guard makes the omission
    // a test failure instead of a silent downgrade.
    expectTypeOf<(typeof ANTHROPIC_MODELS)[number]>().toEqualTypeOf<
      keyof AnthropicChatModelToolCapabilitiesByName
    >()
    expectTypeOf<(typeof ANTHROPIC_MODELS)[number]>().toEqualTypeOf<
      keyof AnthropicChatModelProviderOptionsByName
    >()
    expectTypeOf<(typeof ANTHROPIC_MODELS)[number]>().toEqualTypeOf<
      keyof AnthropicModelInputModalitiesByName
    >()
  })
})
