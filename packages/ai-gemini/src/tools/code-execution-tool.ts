import { brandProviderTool } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export interface CodeExecutionToolConfig {}

/** @deprecated Renamed to `CodeExecutionToolConfig`. Will be removed in a future release. */
export type CodeExecutionTool = CodeExecutionToolConfig

export type GeminiCodeExecutionTool = ProviderTool<'gemini', 'code_execution'>

export function convertCodeExecutionToolToAdapterFormat(_tool: Tool) {
  return {
    codeExecution: {},
  }
}

export function codeExecutionTool(): GeminiCodeExecutionTool {
  return brandProviderTool<GeminiCodeExecutionTool>({
    name: 'code_execution',
    description: '',
    metadata: {},
  })
}
