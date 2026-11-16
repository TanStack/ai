import type { ToolExecutionContext } from '@tanstack/ai'

// ============================================================================
// Shared helpers
// ============================================================================

export { wrapCode } from './code-wrapper'

// ============================================================================
// Isolate Driver Interfaces
// ============================================================================

/**
 * Interface for isolate/sandbox drivers.
 *
 * Each runtime environment (QuickJS, Node, Cloudflare, E2B, Daytona, …)
 * implements this to provide sandboxed code execution. This is the single
 * engine-agnostic seam every driver shares — the injected binding set is the
 * security boundary, the sandbox is defense in depth.
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
   * Execute generated code and return results. Drivers stop the run when
   * `options.signal` aborts, if their runtime can.
   */
  execute: <T = unknown>(
    code: string,
    options?: { signal?: AbortSignal },
  ) => Promise<ExecutionResult<T>>

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
  outputSchema?: Record<string, unknown> | undefined

  /**
   * The execute function that will be injected into the sandbox.
   * Accepts optional context for emitting custom events.
   */
  execute: (args: unknown, context?: ToolExecutionContext) => Promise<unknown>
}

// Re-export for convenience
export type { ToolExecutionContext }
