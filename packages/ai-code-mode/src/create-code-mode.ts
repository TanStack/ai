import { createCodeModeTool } from './create-code-mode-tool'
import { createCodeModeSystemPrompt } from './create-system-prompt'
import type { CodeModeToolConfig } from './types'

/**
 * Create both the `execute_typescript` tool and its matching system prompt
 * from a single config object.
 *
 * This is the recommended way to set up Code Mode — it ensures the tool and
 * system prompt always stay in sync.
 *
 * @example
 * ```typescript
 * import { createCodeMode } from '@tanstack/ai-code-mode'
 * import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
 *
 * const { tool, systemPrompt } = createCodeMode({
 *   driver: createNodeIsolateDriver(),
 *   tools: [weatherTool, dbTool],
 *   timeout: 30000,
 * })
 *
 * chat({
 *   systemPrompts: [myPrompt, systemPrompt],
 *   tools: [tool, ...otherTools],
 *   messages,
 * })
 * ```
 */
export function createCodeMode(config: CodeModeToolConfig) {
  return {
    tool: createCodeModeTool(config),
    systemPrompt: createCodeModeSystemPrompt(config),
  }
}
