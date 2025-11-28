import { z } from 'zod'
import type {
  BetaCodeExecutionTool20250522,
  BetaCodeExecutionTool20250825,
} from '@anthropic-ai/sdk/resources/beta'
import type { Tool } from '@tanstack/ai'

export type CodeExecutionTool =
  | BetaCodeExecutionTool20250522
  | BetaCodeExecutionTool20250825

export function convertCodeExecutionToolToAdapterFormat(
  tool: Tool,
): CodeExecutionTool {
  const metadata = tool.metadata as CodeExecutionTool
  return metadata
}

export function codeExecutionTool(config: CodeExecutionTool): Tool {
  return {
    name: 'code_execution',
    description: '',
    inputSchema: z.object({}),
    metadata: config,
  }
}
