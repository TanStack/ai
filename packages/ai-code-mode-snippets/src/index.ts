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
export { snippetsToBindings, snippetsToSimpleBindings } from './snippets-to-bindings'

// Snippet management tools
export { createSnippetManagementTools } from './create-snippet-management-tools'

// System prompt generation
export { createSnippetsSystemPrompt } from './create-snippets-system-prompt'

// Type generation
export { generateSnippetTypes } from './generate-snippet-types'

// Storage implementations
//
// Only the worker/browser-safe in-memory storage is re-exported from the root
// entry. The Node-only file storage (`createFileSnippetStorage`) imports
// `node:fs` / `node:path`, so it lives behind the `@tanstack/ai-code-mode-snippets/storage`
// subpath to keep this root export safe for Cloudflare Workers and browser bundlers.
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
