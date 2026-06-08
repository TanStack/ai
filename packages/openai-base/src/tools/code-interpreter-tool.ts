import type { Tool as SDKTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

type CodeInterpreterToolConfig = SDKTool.CodeInterpreter

export type { CodeInterpreterToolConfig }

/** @deprecated Renamed to `CodeInterpreterToolConfig`. Will be removed in a future release. */
export type CodeInterpreterTool = CodeInterpreterToolConfig

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
 * Creates a standard Tool from CodeInterpreterTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function codeInterpreterTool(
  container: CodeInterpreterToolConfig,
): Tool {
  return {
    name: 'code_interpreter',
    description: 'Execute code in a sandboxed environment',
    metadata: {
      type: 'code_interpreter',
      container,
    },
  }
}
