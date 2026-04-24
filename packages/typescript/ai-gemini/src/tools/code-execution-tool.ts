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
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'code_execution',
    description: '',
    metadata: {},
  } as unknown as GeminiCodeExecutionTool
}
