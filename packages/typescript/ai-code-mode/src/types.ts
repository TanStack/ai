import type {
  ServerTool,
  ToolDefinition,
  ToolExecutionContext,
} from '@tanstack/ai'

// ============================================================================
// Isolate Driver Interfaces
// ============================================================================

/**
 * Interface for isolate/sandbox drivers
 * Each runtime environment implements this to provide sandboxed code execution
 */
export interface IsolateDriver {
  /**
   * Create a new isolated execution context with tool bindings
   */
  createContext: (config: IsolateConfig) => Promise<IsolateContext>
}

/**
 * Configuration for creating an isolate context
 */
export interface IsolateConfig {
  /**
   * Tools transformed into callable bindings for the sandbox
   */
  bindings: Record<string, ToolBinding>

  /**
   * Execution timeout in milliseconds (default: 30000)
   */
  timeout?: number

  /**
   * Memory limit in MB (default: 128)
   */
  memoryLimit?: number
}

/**
 * Isolated execution context with tool bindings injected
 */
export interface IsolateContext {
  /**
   * Execute generated code and return results
   */
  execute: <T = unknown>(code: string) => Promise<ExecutionResult<T>>

  /**
   * Clean up sandbox resources
   */
  dispose: () => Promise<void>
}

/**
 * Result of code execution in the sandbox
 */
export interface ExecutionResult<T = unknown> {
  /**
   * Whether execution completed without errors
   */
  success: boolean

  /**
   * Return value from the executed code (if successful)
   */
  value?: T

  /**
   * Normalized error information (if failed)
   */
  error?: NormalizedError

  /**
   * Console output captured during execution
   */
  logs?: Array<string>
}

/**
 * Normalized error format for cross-runtime compatibility
 */
export interface NormalizedError {
  /**
   * Error name/type
   */
  name: string

  /**
   * Error message
   */
  message: string

  /**
   * Stack trace (if available)
   */
  stack?: string

  /**
   * Error code (if available)
   */
  code?: string
}

// ============================================================================
// Tool Binding Interfaces
// ============================================================================

/**
 * A tool transformed into a format suitable for sandbox injection
 */
export interface ToolBinding {
  /**
   * Unique tool identifier
   */
  name: string

  /**
   * Human-readable description for the LLM
   */
  description: string

  /**
   * JSON Schema for tool input parameters
   */
  inputSchema: Record<string, unknown>

  /**
   * JSON Schema for tool output (optional)
   */
  outputSchema?: Record<string, unknown>

  /**
   * The execute function that will be injected into the sandbox.
   * Accepts optional context for emitting custom events.
   */
  execute: (args: unknown, context?: ToolExecutionContext) => Promise<unknown>
}

// Re-export for convenience
export type { ToolExecutionContext }

// ============================================================================
// Code Mode Tool Types
// ============================================================================

/**
 * Tool types that can be passed to Code Mode
 */
export type CodeModeTool =
  | ServerTool<any, any, any>
  | ToolDefinition<any, any, any>

/**
 * Configuration for createCodeModeTool
 */
export interface CodeModeToolConfig {
  /**
   * Isolate driver for sandboxed code execution
   */
  driver: IsolateDriver

  /**
   * Tools to expose as external_* functions in the sandbox
   */
  tools: Array<CodeModeTool>

  /**
   * Execution timeout in milliseconds (default: 30000)
   */
  timeout?: number

  /**
   * Memory limit for isolate in MB (default: 128)
   */
  memoryLimit?: number

  /**
   * Optional function to get additional bindings dynamically.
   * Called at execution time (each execute_typescript call) to get current skill bindings.
   * These are merged with the static external_* bindings.
   *
   * @returns Record of skill bindings with skill_ prefix
   *
   * @example
   * ```typescript
   * getSkillBindings: async () => {
   *   const skills = await storage.loadAll()
   *   return skillsToBindings(skills, 'skill_')
   * }
   * ```
   */
  getSkillBindings?: () => Promise<Record<string, ToolBinding>>
}

/**
 * Result returned by the execute_typescript tool
 */
export interface CodeModeToolResult {
  /**
   * Whether execution completed without errors
   */
  success: boolean

  /**
   * Return value from the executed code (if successful)
   */
  result?: unknown

  /**
   * Console output captured during execution
   */
  logs?: Array<string>

  /**
   * Error details if execution failed
   */
  error?: {
    message: string
    name?: string
    line?: number
  }
}
