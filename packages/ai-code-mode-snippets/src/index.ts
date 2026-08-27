// Main entry point
export {
  codeModeWithSnippets,
  createCodeModeWithSnippetsConfig,
} from './code-mode-with-snippets'
export type {
  CodeModeWithSnippetsOptions,
  CodeModeWithSnippetsResult,
} from './code-mode-with-snippets'

// Trust strategies
export {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
  createCustomTrustStrategy,
} from './trust-strategies'
export type { TrustStrategy } from './trust-strategies'

// Snippet selection
export { selectRelevantSnippets } from './select-relevant-snippets'

// Snippets to tools (for direct calling)
export { snippetsToTools, snippetToTool } from './snippets-to-tools'
export type { SnippetToToolOptions } from './snippets-to-tools'

// Snippets to bindings (for sandbox injection - legacy)
export {
  snippetsToBindings,
  snippetsToSimpleBindings,
} from './snippets-to-bindings'

// Snippet management tools
export { createSnippetManagementTools } from './create-snippet-management-tools'

// System prompt generation
export { createSnippetsSystemPrompt } from './create-snippets-system-prompt'

// Type generation
export { generateSnippetTypes } from './generate-snippet-types'

export { createMemorySnippetStorage } from './storage/memory-storage'
export type { MemorySnippetStorageOptions } from './storage/memory-storage'

// All types
export type {
  Snippet,
  SnippetIndexEntry,
  SnippetStorage,
  SnippetsConfig,
  SnippetStats,
  TrustLevel,
  SnippetBinding,
} from './types'
