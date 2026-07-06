import type {
  LazyToolsConfig,
  SchemaInput,
  ServerTool,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { SecretParameterHandler } from './validate-bindings'

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
  outputSchema?: Record<string, unknown> | undefined

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
 * Server-side tool types that can be passed to Code Mode.
 *
 * Code Mode executes tools inside a server-managed sandbox. Client tools and
 * bare tool definitions are intentionally excluded because they do not provide
 * a server execution implementation for the sandbox binding.
 */
export type CodeModeTool = ServerTool<SchemaInput, SchemaInput, string, unknown>

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

  /**
   * How to surface tool parameters whose names look like secrets.
   * Defaults to `'warn'` (logs via `console.warn`).
   *
   * - `'warn'`: log a warning for each match.
   * - `'throw'`: throw an Error on the first match — useful in tests/CI.
   * - `'ignore'`: suppress the check entirely.
   * - `(info) => void`: receive each match and decide how to react.
   *
   * Matches are deduplicated per `(toolName, paramPath)` across the lifetime
   * of a single `createCodeModeTool` instance.
   */
  onSecretParameter?: SecretParameterHandler

  /**
   * Optional lazy-tool discovery config. Tools marked `lazy: true` are kept out
   * of the system prompt's full documentation and listed in a Discoverable APIs
   * catalog instead; this tunes how much of each lazy tool's description that
   * catalog shows. Optional — defaults to `{ includeDescription: 'none' }`.
   */
  lazyToolsConfig?: LazyToolsConfig

  /**
   * Optional escape hatch to swap out the TypeScript-stripping step.
   *
   * Receives the raw model-generated code and must return runnable JavaScript
   * with all TypeScript syntax removed. Defaults to the built-in
   * {@link stripTypeScript}, which uses sucrase and is safe to bundle for
   * browsers and edge runtimes (Cloudflare Workers/Pages etc.).
   *
   * Provide your own only to trade the edge-safe default for a faster
   * Node-only transpiler. A custom transpiler MUST tolerate top-level `return`
   * and `await` in its input (the default wraps the code in an async function
   * internally to allow this).
   *
   * NOTE: This only affects `createCodeModeTool`. The skills helpers
   * (`skillsToTools`, `codeModeWithSkills` in `@tanstack/ai-code-mode-skills`)
   * call the exported `stripTypeScript` directly, so they ignore this hook — but
   * they still get the edge-safe sucrase default, so #487 is fixed for them too;
   * they just can't be pointed at a different transpiler.
   *
   * @example
   * ```typescript
   * // Node-only fast path using esbuild (NOT edge-safe — Node only). esbuild
   * // rejects top-level `return`, so reuse the same async-function wrapper the
   * // default uses, then slice the body back out. `keepNames: false` stops
   * // esbuild injecting `__name()` helpers the sandbox can't resolve.
   * import { transformSync } from 'esbuild'
   * transpile: (code) => {
   *   const out = transformSync(`async function _w(){\n${code}\n}`, {
   *     loader: 'ts',
   *     keepNames: false,
   *   }).code
   *   return out.slice(out.indexOf('{') + 1, out.lastIndexOf('}'))
   * }
   * ```
   */
  transpile?: (code: string) => string | Promise<string>
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
  error?:
    | {
        message: string
        name?: string | undefined
        line?: number | undefined
      }
    | undefined
}

/**
 * Return shape of `createCodeMode`. `tool` (execute_typescript) and
 * `systemPrompt` are preserved for backward compatibility; `discoveryTool` and
 * `tools` are additive. Spread `tools` into `chat({ tools })`.
 */
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
