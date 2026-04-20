import type { AnyTextAdapter, ModelMessage, ToolRegistry } from '@tanstack/ai'
import type { CodeModeToolConfig } from '@tanstack/ai-code-mode'
import type { TrustStrategy } from './trust-strategies'

// ============================================================================
// Trust Levels
// ============================================================================

/**
 * Trust level for a skill
 * - untrusted: Newly created, not yet proven
 * - provisional: Has been successfully executed 10+ times with 90%+ success
 * - trusted: Has been successfully executed 100+ times with 95%+ success
 */
export type TrustLevel = 'untrusted' | 'provisional' | 'trusted'

// ============================================================================
// Skill Statistics
// ============================================================================

/**
 * Execution statistics for a skill
 */
export interface SkillStats {
  /**
   * Total number of times this skill has been executed
   */
  executions: number

  /**
   * Success rate (0-1) based on execution history
   */
  successRate: number
}

// ============================================================================
// Skill Types
// ============================================================================

/**
 * A reusable skill that can be executed in the Code Mode sandbox
 */
export interface Skill {
  /**
   * Unique identifier for the skill
   */
  id: string

  /**
   * Unique name in snake_case (e.g., 'fetch_github_stats')
   * This becomes the function name with skill_ prefix in the sandbox
   */
  name: string

  /**
   * Human-readable description of what the skill does
   */
  description: string

  /**
   * TypeScript code that implements the skill
   * The code receives `input` as a variable and can call:
   * - external_* functions (tools)
   * - other skill_* functions (skills)
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
   * Hints about when to use this skill
   * e.g., "Use when comparing NPM package popularity"
   */
  usageHints: Array<string>

  /**
   * Names of other skills this skill depends on/calls
   */
  dependsOn: Array<string>

  /**
   * Trust level based on execution history
   */
  trustLevel: TrustLevel

  /**
   * Execution statistics
   */
  stats: SkillStats

  /**
   * ISO timestamp when the skill was created
   */
  createdAt: string

  /**
   * ISO timestamp when the skill was last updated
   */
  updatedAt: string
}

// ============================================================================
// Skill Index Types
// ============================================================================

/**
 * Lightweight skill entry for the index (metadata only, no code)
 * Used for fast loading and skill selection
 */
export type SkillIndexEntry = Pick<
  Skill,
  'id' | 'name' | 'description' | 'usageHints' | 'trustLevel'
>

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Options for searching skills
 */
export interface SkillSearchOptions {
  /**
   * Maximum number of results to return
   * @default 5
   */
  limit?: number
}

/**
 * Interface for skill storage implementations
 */
export interface SkillStorage {
  /**
   * Load the skill index (lightweight metadata for all skills)
   */
  loadIndex: () => Promise<Array<SkillIndexEntry>>

  /**
   * Load all skills with full details (including code)
   */
  loadAll: () => Promise<Array<Skill>>

  /**
   * Get a skill by name
   */
  get: (name: string) => Promise<Skill | null>

  /**
   * Save a skill (create or update)
   */
  save: (skill: Omit<Skill, 'createdAt' | 'updatedAt'>) => Promise<Skill>

  /**
   * Delete a skill by name
   */
  delete: (name: string) => Promise<boolean>

  /**
   * Search for skills by query
   */
  search: (
    query: string,
    options?: SkillSearchOptions,
  ) => Promise<Array<SkillIndexEntry>>

  /**
   * Update execution statistics for a skill
   */
  updateStats: (name: string, success: boolean) => Promise<void>

  /**
   * Trust strategy used by this storage (optional, for creating new skills)
   */
  trustStrategy?: TrustStrategy
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the skills system
 */
export interface SkillsConfig {
  /**
   * Storage implementation for skills
   */
  storage: SkillStorage

  /**
   * Maximum number of skills to load into context per request
   * @default 5
   */
  maxSkillsInContext?: number

  /**
   * Trust strategy for determining skill trust levels
   * @default createDefaultTrustStrategy()
   */
  trustStrategy?: TrustStrategy
}

/**
 * Options for codeModeWithSkills
 */
export interface CodeModeWithSkillsOptions {
  /**
   * Code Mode tool configuration (driver, tools, timeout, memoryLimit)
   */
  config: CodeModeToolConfig

  /**
   * Text adapter for skill selection (should be a cheap/fast model)
   */
  adapter: AnyTextAdapter

  /**
   * Skills configuration
   */
  skills: SkillsConfig

  /**
   * Current conversation messages (used for context-aware skill selection)
   */
  messages: Array<ModelMessage>

  /**
   * Whether to include skills as direct tools (not just sandbox bindings).
   * When true, skills become first-class tools the LLM can call directly.
   * @default true
   */
  skillsAsTools?: boolean
}

/**
 * Result from codeModeWithSkills
 */
export interface CodeModeWithSkillsResult {
  /**
   * Tool registry for dynamic tool management.
   * Pass this to chat() via the toolRegistry option.
   * Skills registered mid-stream will be added to this registry.
   */
  toolsRegistry: ToolRegistry

  /**
   * System prompt documenting available skills and external functions
   */
  systemPrompt: string

  /**
   * Skills that were selected for this request
   */
  selectedSkills: Array<Skill>
}

// ============================================================================
// Skill Binding Types (internal)
// ============================================================================

/**
 * A skill transformed into a format suitable for sandbox injection
 */
export interface SkillBinding {
  /**
   * Function name with skill_ prefix
   */
  name: string

  /**
   * The skill this binding wraps
   */
  skill: Skill

  /**
   * Execute function that runs the skill code
   */
  execute: (input: unknown) => Promise<unknown>
}
