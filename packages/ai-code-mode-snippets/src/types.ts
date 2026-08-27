import type { AnyTextAdapter, ModelMessage, ToolRegistry } from '@tanstack/ai'
import type { CodeModeToolConfig } from '@tanstack/ai-code-mode'
import type { TrustStrategy } from './trust-strategies'

export type TrustLevel = 'untrusted' | 'provisional' | 'trusted'

export interface SnippetStats {
  executions: number

  successRate: number
}

export interface Snippet {
  id: string

  name: string

  description: string

  code: string

  inputSchema: Record<string, unknown>

  outputSchema: Record<string, unknown>

  usageHints: Array<string>

  dependsOn: Array<string>

  trustLevel: TrustLevel

  stats: SnippetStats

  createdAt: string

  updatedAt: string
}

export type SnippetIndexEntry = Pick<
  Snippet,
  'id' | 'name' | 'description' | 'usageHints' | 'trustLevel'
>

export interface SnippetSearchOptions {
  limit?: number
}

export interface SnippetStorage {
  loadIndex: () => Promise<Array<SnippetIndexEntry>>

  loadAll: () => Promise<Array<Snippet>>

  get: (name: string) => Promise<Snippet | null>

  save: (snippet: Omit<Snippet, 'createdAt' | 'updatedAt'>) => Promise<Snippet>

  delete: (name: string) => Promise<boolean>

  search: (
    query: string,
    options?: SnippetSearchOptions,
  ) => Promise<Array<SnippetIndexEntry>>

  updateStats: (name: string, success: boolean) => Promise<void>

  trustStrategy?: TrustStrategy
}

export interface SnippetsConfig {
  storage: SnippetStorage

  maxSnippetsInContext?: number

  trustStrategy?: TrustStrategy
}

export interface CodeModeWithSnippetsOptions {
  config: CodeModeToolConfig

  adapter: AnyTextAdapter

  snippets: SnippetsConfig

  messages: Array<ModelMessage>

  snippetsAsTools?: boolean
}

export interface CodeModeWithSnippetsResult {
  toolsRegistry: ToolRegistry

  systemPrompt: string

  selectedSnippets: Array<Snippet>
}

export interface SnippetBinding {
  name: string

  snippet: Snippet

  execute: (input: unknown) => Promise<unknown>
}
