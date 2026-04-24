import type {
  BetaCodeExecutionTool20250522,
  BetaCodeExecutionTool20250825,
} from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type CodeExecutionToolConfig =
  | BetaCodeExecutionTool20250522
  | BetaCodeExecutionTool20250825

/** @deprecated Renamed to `CodeExecutionToolConfig`. Will be removed in a future release. */
export type CodeExecutionTool = CodeExecutionToolConfig

export type AnthropicCodeExecutionTool = ProviderTool<
  'anthropic',
  'code_execution'
>

export function convertCodeExecutionToolToAdapterFormat(
  tool: Tool,
): CodeExecutionToolConfig {
  const metadata = tool.metadata as CodeExecutionToolConfig
  return metadata
}

export function codeExecutionTool(
  config: CodeExecutionToolConfig,
): AnthropicCodeExecutionTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'code_execution',
    description: '',
    metadata: config,
  } as unknown as AnthropicCodeExecutionTool
}
