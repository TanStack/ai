/**
 * Per-model type-safety tests for Gemini provider tools.
 *
 * Positive cases: each supported (model, tool) pair compiles cleanly.
 * Negative cases: unsupported (model, tool) pairs produce a `@ts-expect-error`.
 */
import { beforeAll, describe, it } from 'vitest'
import { z } from 'zod'
import { Environment } from '@google/genai'
import { toolDefinition } from '@tanstack/ai'
import { geminiText } from '../src'
import {
  codeExecutionTool,
  computerUseTool,
  fileSearchTool,
  googleMapsTool,
  googleSearchRetrievalTool,
  googleSearchTool,
  urlContextTool,
} from '../src/tools'
import type { TextActivityOptions } from '@tanstack/ai/adapters'

// Helper — keeps each `it` body to one call (test-hygiene Rule 1).
function typedTools<TAdapter extends ReturnType<typeof geminiText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['GOOGLE_API_KEY'] = 'sk-test-dummy'
})

// Minimal user tool — always assignable regardless of model.
const userTool = toolDefinition({
  name: 'echo',
  description: 'echoes input',
  inputSchema: z.object({ msg: z.string() }),
}).server(async ({ msg }) => msg)

describe('Gemini per-model tool gating', () => {
  it('gemini-3.1-pro-preview accepts code_execution, file_search, google_search, url_context', () => {
    const adapter = geminiText('gemini-3.1-pro-preview')
    const fileSearchConfig: Parameters<typeof fileSearchTool>[0] = {
      fileSearchStoreNames: [],
    }
    typedTools(adapter, [
      userTool,
      codeExecutionTool(),
      fileSearchTool(fileSearchConfig),
      googleSearchTool(),
      urlContextTool(),
      // @ts-expect-error - gemini-3.1-pro-preview does not support computer_use
      computerUseTool({
        environment: Environment.ENVIRONMENT_BROWSER,
        excludedPredefinedFunctions: [],
      }),
      // @ts-expect-error - gemini-3.1-pro-preview does not support google_maps
      googleMapsTool(),
      // @ts-expect-error - gemini-3.1-pro-preview does not support google_search_retrieval
      googleSearchRetrievalTool(),
    ])
  })

  it('gemini-2.0-flash-lite rejects all provider tools', () => {
    const adapter = geminiText('gemini-2.0-flash-lite')
    typedTools(adapter, [
      userTool,
      // @ts-expect-error - gemini-2.0-flash-lite does not support code_execution
      codeExecutionTool(),
      // @ts-expect-error - gemini-2.0-flash-lite does not support computer_use
      computerUseTool({}),
      // @ts-expect-error - gemini-2.0-flash-lite does not support file_search
      fileSearchTool({ fileSearchStoreNames: [] }),
      // @ts-expect-error - gemini-2.0-flash-lite does not support google_maps
      googleMapsTool(),
      // @ts-expect-error - gemini-2.0-flash-lite does not support google_search
      googleSearchTool(),
      // @ts-expect-error - gemini-2.0-flash-lite does not support google_search_retrieval
      googleSearchRetrievalTool(),
      // @ts-expect-error - gemini-2.0-flash-lite does not support url_context
      urlContextTool(),
    ])
  })
})
