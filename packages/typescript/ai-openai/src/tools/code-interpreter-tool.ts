import type { ProviderTool, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

export type CodeInterpreterToolConfig = OpenAI.Responses.Tool.CodeInterpreter

/** @deprecated Renamed to `CodeInterpreterToolConfig`. Will be removed in a future release. */
export type CodeInterpreterTool = CodeInterpreterToolConfig

export type OpenAICodeInterpreterTool = ProviderTool<
  'openai',
  'code_interpreter'
>

/**
 * Converts a standard Tool to OpenAI CodeInterpreterTool format
 */
export function convertCodeInterpreterToolToAdapterFormat(
  tool: Tool,
): CodeInterpreterToolConfig {
  const metadata = tool.metadata as CodeInterpreterToolConfig
  return {
    type: 'code_interpreter',
    container: metadata.container,
  }
}

/**
 * Creates a standard Tool from CodeInterpreterTool parameters
 */
export function codeInterpreterTool(
  container: CodeInterpreterToolConfig,
): OpenAICodeInterpreterTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'code_interpreter',
    description: 'Execute code in a sandboxed environment',
    metadata: {
      type: 'code_interpreter',
      container,
    },
  } as unknown as OpenAICodeInterpreterTool
}
