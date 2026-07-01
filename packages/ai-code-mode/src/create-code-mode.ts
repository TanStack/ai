import { createCodeModeTool } from './create-code-mode-tool'
import { createCodeModeSystemPrompt } from './create-system-prompt'
import { createDiscoveryTool } from './create-discovery-tool'
import type { CodeModeToolConfig, CreateCodeModeResult } from './types'

/**
 * Create the `execute_typescript` tool, its matching system prompt, and (when
 * any tools are marked `lazy: true`) a `discover_tools` companion tool.
 *
 * @example
 * ```typescript
 * import { createCodeMode } from '@tanstack/ai-code-mode'
 * import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
 *
 * const { tools, systemPrompt } = createCodeMode({
 *   driver: createNodeIsolateDriver(),
 *   tools: [weatherTool, rarelyUsedTool], // mark rarelyUsedTool lazy: true
 * })
 *
 * chat({
 *   systemPrompts: [myPrompt, systemPrompt],
 *   tools: [...tools, ...otherTools],
 *   messages,
 * })
 * ```
 */
export function createCodeMode(
  config: CodeModeToolConfig,
): CreateCodeModeResult {
  const tool = createCodeModeTool(config)
  const systemPrompt = createCodeModeSystemPrompt(config)

  const lazyTools = config.tools.filter((t) => t.lazy)
  const discoveryTool =
    lazyTools.length > 0
      ? createDiscoveryTool(lazyTools, config.lazyToolsConfig)
      : null

  return {
    tool,
    discoveryTool,
    tools: discoveryTool ? [tool, discoveryTool] : [tool],
    systemPrompt,
  }
}
