/**
 * Per-model type-safety tests for OpenRouter provider tools.
 *
 * Positive cases: each supported (model, tool) pair compiles cleanly.
 * Negative cases: unsupported (model, tool) pairs produce a `@ts-expect-error`.
 */
import { beforeAll, describe, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { openRouterText } from '../src'
import { webSearchTool } from '../src/tools'
import type { TextActivityOptions } from '@tanstack/ai/adapters'
import type { ProviderTool } from '@tanstack/ai'

// Helper — keeps each `it` body to one call (test-hygiene Rule 1).
function typedTools<TAdapter extends ReturnType<typeof openRouterText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test-dummy'
})

// Minimal user tool — always assignable regardless of model.
const userTool = toolDefinition({
  name: 'echo',
  description: 'echoes input',
  inputSchema: z.object({ msg: z.string() }),
}).server(async ({ msg }) => msg)

describe('OpenRouter per-model tool gating', () => {
  it('anthropic/claude-opus-4.6 accepts webSearchTool and user-defined tools', () => {
    const adapter = openRouterText('anthropic/claude-opus-4.6')
    typedTools(adapter, [
      userTool,
      webSearchTool({ engine: 'native', maxResults: 5 }),
    ])
  })

  it('openai/gpt-4o accepts webSearchTool and user-defined tools', () => {
    const adapter = openRouterText('openai/gpt-4o')
    typedTools(adapter, [
      userTool,
      webSearchTool({ engine: 'exa', searchPrompt: 'latest news' }),
    ])
  })

  it('rejects provider tools with kinds not in supports.tools', () => {
    const adapter = openRouterText('anthropic/claude-opus-4.6')
    const fakeTool = {
      name: 'code_execution',
      description: '',
      metadata: {},
    } as ProviderTool<'openrouter', 'code_execution'>
    typedTools(adapter, [
      // @ts-expect-error - 'code_execution' is not in openrouter's supports.tools
      fakeTool,
    ])
  })
})
