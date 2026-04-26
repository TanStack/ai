/**
 * Example helper: inner code-mode chat + {@link createExecutePromptTool}.
 */
import {
  createCodeMode,
  type CodeModeTool,
  type IsolateDriver,
  type ToolBinding,
} from '@tanstack/ai-code-mode'
import type { AnyTextAdapter } from '@tanstack/ai'
import {
  createExecutePromptTool,
  type CreateExecutePromptToolConfig,
  type ExecutePromptEvent,
} from './create-execute-prompt-tool'

export type { CreateExecutePromptToolConfig, ExecutePromptEvent }

export interface ExecutePromptOptions {
  adapter: AnyTextAdapter
  prompt: string
  tools: Array<CodeModeTool>
  driver: IsolateDriver
  system?: string
  maxTokens?: number
  timeout?: number
  memoryLimit?: number
  getSkillBindings?: () => Promise<Record<string, ToolBinding>>
  onEvent?: (event: ExecutePromptEvent) => void
}

export interface ExecutePromptResult {
  data: unknown
}

export function executePrompt(
  options: ExecutePromptOptions,
): Promise<ExecutePromptResult> {
  const {
    prompt,
    adapter,
    tools,
    driver,
    system,
    maxTokens,
    timeout,
    memoryLimit,
    getSkillBindings,
    onEvent,
  } = options

  const { tool } = createExecutePromptTool({
    adapter,
    system,
    maxTokens,
    onEvent,
    inner: createCodeMode({
      driver,
      tools,
      timeout,
      memoryLimit,
      getSkillBindings,
    }),
  })
  return tool.execute!({ prompt })
}
