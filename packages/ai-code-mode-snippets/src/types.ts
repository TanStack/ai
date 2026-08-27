import type { AnyTextAdapter, ModelMessage, ToolRegistry } from '@tanstack/ai'
import type { CodeModeToolConfig } from '@tanstack/ai-code-mode'
import type { TrustStrategy } from './trust-strategies'

/**
 * Trust level for a snippet
 * - untrusted: Newly created, not yet proven
 * - provisional: Has been successfully executed 10+ times with 90%+ success
 * - trusted: Has been successfully executed 100+ times with 95%+ success
 */
export type TrustLevel = 'untrusted' | 'provisional' | 'trusted'

/**
 * Execution statistics for a snippet
 */
export interface SnippetStats {
  /**
   * Total number of times this snippet has been executed
   */
  executions: number

  /**
   * Success rate (0-1) based on execution history
   */
  successRate: number
}

/**
 * A reusable snippet that can be executed in the Code Mode sandbox
 */
export interface Snippet {
  /**
   * Unique identifier for the snippet
   */
  id: string

  /**
   * Unique name in snake_case (e.g., 'fetch_github_stats')
   * This becomes the function name with snippet_ prefix in the sandbox
   */
  name: string

  /**
   * Human-readable description of what the snippet does
   */
  description: string

  /**
   * TypeScript code that implements the snippet
   * The code receives `input` as a variable and can call:
   * - external_* functions (tools)
   * - other snippet_* functions (snippets)
   * Should return a value
   */
  code: string

  /**
   * JSON Schema describing the input parameter
   */
  inputSchema: Record<string, unknown>

  /**
   * JSON Schema describing the return value
   */
  outputSchema: Record<string, unknown>

  /**
   * Hints about when to use this snippet
   * e.g., "Use when comparing NPM package popularity"
   */
  usageHints: Array<string>

  /**
   * Names of other snippets this snippet depends on/calls
   */
  dependsOn: Array<string>

  /**
   * Trust level based on execution history
   */
  trustLevel: TrustLevel

  /**
   * Execution statistics
   */
  stats: SnippetStats

  /**
   * ISO timestamp when the snippet was created
   */
  createdAt: string

  /**
   * ISO timestamp when the snippet was last updated
   */
  updatedAt: string
}

/**
 * Lightweight snippet entry for the index (metadata only, no code)
 * Used for fast loading and snippet selection
 */
export type SnippetIndexEntry = Pick<
  Snippet,
  'id' | 'name' | 'description' | 'usageHints' | 'trustLevel'
>

/**
 * Options for searching snippets
 */
export interface SnippetSearchOptions {
  /**
   * Maximum number of results to return
   * @default 5
   */
  limit?: number
}

/**
 * Interface for snippet storage implementations
 */
export interface SnippetStorage {
  /**
   * Load the snippet index (lightweight metadata for all snippets)
   */
  loadIndex: () => Promise<Array<SnippetIndexEntry>>

  /**
   * Load all snippets with full details (including code)
   */
  loadAll: () => Promise<Array<Snippet>>

  /**
   * Get a snippet by name
   */
  get: (name: string) => Promise<Snippet | null>

  /**
   * Save a snippet (create or update)
   */
  save: (snippet: Omit<Snippet, 'createdAt' | 'updatedAt'>) => Promise<Snippet>

  /**
   * Delete a snippet by name
   */
  delete: (name: string) => Promise<boolean>

  /**
   * Search for snippets by query
   */
  search: (
    query: string,
    options?: SnippetSearchOptions,
  ) => Promise<Array<SnippetIndexEntry>>

  /**
   * Update execution statistics for a snippet
   */
  updateStats: (name: string, success: boolean) => Promise<void>

  /**
   * Trust strategy used by this storage (optional, for creating new snippets)
   */
  trustStrategy?: TrustStrategy
}

/**
 * Configuration for the snippets system
 */
export interface SnippetsConfig {
  /**
   * Storage implementation for snippets
   */
  storage: SnippetStorage

  /**
   * Maximum number of snippets to load into context per request
   * @default 5
   */
  maxSnippetsInContext?: number

  trustStrategy?: TrustStrategy
}

/**
 * Options for codeModeWithSnippets
 */
export interface CodeModeWithSnippetsOptions {
  /**
   * Code Mode tool configuration (driver, tools, timeout, memoryLimit)
   */
  config: CodeModeToolConfig

  /**
   * Text adapter for snippet selection (should be a cheap/fast model)
   */
  adapter: AnyTextAdapter

  /**
   * Snippets configuration
   */
  snippets: SnippetsConfig

  /**
   * Current conversation messages (used for context-aware snippet selection)
   */
  messages: Array<ModelMessage>

  /**
   * Whether to include snippets as direct tools (not just sandbox bindings).
   * When true, snippets become first-class tools the LLM can call directly.
   * @default true
   */
  snippetsAsTools?: boolean
}

/**
 * Result from codeModeWithSnippets
 */
export interface CodeModeWithSnippetsResult {
  /**
   * Tool registry for dynamic tool management.
   * Pass this to chat() via the toolRegistry option.
   * Snippets registered mid-stream will be added to this registry.
   */
  toolsRegistry: ToolRegistry

  /**
   * System prompt documenting available snippets and external functions
   */
  systemPrompt: string

  /**
   * Snippets that were selected for this request
   */
  selectedSnippets: Array<Snippet>
}

/**
 * A snippet transformed into a format suitable for sandbox injection
 */
export interface SnippetBinding {
  name: string

  /**
   * The snippet this binding wraps
   */
  snippet: Snippet

  /**
   * Execute function that runs the snippet code
   */
  execute: (input: unknown) => Promise<unknown>
}
