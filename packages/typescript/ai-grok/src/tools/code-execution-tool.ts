import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

// xAI accepts `code_execution` as a built-in tool name. Keep the shape minimal
// until the provider publishes a richer public schema.
export interface CodeExecutionToolConfig {
  type: 'code_execution'
}

export type CodeExecutionToolOptions = Omit<CodeExecutionToolConfig, 'type'>

/** @deprecated Renamed to `CodeExecutionToolConfig`. Will be removed in a future release. */
export type CodeExecutionTool = CodeExecutionToolConfig

export type GrokCodeExecutionTool = ProviderTool<'grok', 'code_execution'>
export type CodeInterpreterToolConfig = OpenAI.Responses.Tool.CodeInterpreter
export type GrokCodeInterpreterTool = ProviderTool<'grok', 'code_interpreter'>

export function convertCodeExecutionToolToAdapterFormat(
  tool: Tool,
): CodeExecutionToolConfig {
  const metadata = tool.metadata as Partial<CodeExecutionToolConfig> | undefined
  return {
    type: 'code_execution',
    ...metadata,
  }
}

export function convertCodeInterpreterToolToAdapterFormat(
  tool: Tool,
): CodeInterpreterToolConfig {
  const metadata = tool.metadata as CodeInterpreterToolConfig
  return {
    type: 'code_interpreter',
    container: metadata.container,
  }
}

export function codeExecutionTool(
  toolData: CodeExecutionToolOptions = {},
): GrokCodeExecutionTool {
  return {
    name: 'code_execution',
    description: 'Run Python code in a sandboxed environment',
    metadata: { type: 'code_execution', ...toolData },
  } as unknown as GrokCodeExecutionTool
}

export function codeInterpreterTool(
  container: CodeInterpreterToolConfig['container'],
): GrokCodeInterpreterTool {
  return {
    name: 'code_interpreter',
    description: 'Run Python code in a sandboxed environment',
    metadata: {
      type: 'code_interpreter',
      container,
    },
  } as unknown as GrokCodeInterpreterTool
}
