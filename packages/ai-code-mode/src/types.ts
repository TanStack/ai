import type {
  LazyToolsConfig,
  SchemaInput,
  ServerTool,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { SecretParameterHandler } from './validate-bindings'

export interface IsolateDriver {
  createContext: (config: IsolateConfig) => Promise<IsolateContext>
}

export interface IsolateConfig {
  bindings: Record<string, ToolBinding>

  timeout?: number

  memoryLimit?: number
}

export interface IsolateContext {
  execute: <T = unknown>(code: string) => Promise<ExecutionResult<T>>

  dispose: () => Promise<void>
}

export interface ExecutionResult<T = unknown> {
  success: boolean

  value?: T

  error?: NormalizedError

  logs?: Array<string>
}

export interface NormalizedError {
  name: string

  message: string

  stack?: string

  code?: string
}

export interface ToolBinding {
  name: string

  description: string

  inputSchema: Record<string, unknown>

  outputSchema?: Record<string, unknown> | undefined

  execute: (args: unknown, context?: ToolExecutionContext) => Promise<unknown>
}

// Re-export for convenience
export type { ToolExecutionContext }

export type CodeModeTool = ServerTool<SchemaInput, SchemaInput, string, unknown>

export interface CodeModeToolConfig {
  driver: IsolateDriver

  tools: Array<CodeModeTool>

  timeout?: number

  memoryLimit?: number

  getSnippetBindings?: () => Promise<Record<string, ToolBinding>>

  onSecretParameter?: SecretParameterHandler

  lazyToolsConfig?: LazyToolsConfig

  transpile?: (code: string) => string | Promise<string>
}

export interface CodeModeToolResult {
  success: boolean

  result?: unknown

  logs?: Array<string>

  error?:
    | {
        message: string
        name?: string | undefined
        line?: number | undefined
        stack?: string | undefined
      }
    | undefined
}

export interface CreateCodeModeResult {
  /** The execute_typescript tool. */
  tool: ServerTool<SchemaInput, SchemaInput, 'execute_typescript'>
  /** The discover_tools tool, or null when there are no lazy tools. */
  discoveryTool: ServerTool<SchemaInput, SchemaInput, 'discover_tools'> | null
  /** [tool] or [tool, discoveryTool] — the array to spread into chat({ tools }). */
  tools: Array<ServerTool<SchemaInput, SchemaInput, string>>
  /** The matching system prompt. */
  systemPrompt: string
}
