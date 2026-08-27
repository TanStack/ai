import { createCodeModeTool } from './create-code-mode-tool'
import { createCodeModeSystemPrompt } from './create-system-prompt'
import { createDiscoveryTool } from './create-discovery-tool'
import type { CodeModeToolConfig, CreateCodeModeResult } from './types'

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
