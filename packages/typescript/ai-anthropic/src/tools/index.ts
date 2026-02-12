import type { ToolUnion } from '@anthropic-ai/sdk/resources/messages'
import type { BashTool } from './bash-tool'
import type { CodeExecutionTool } from './code-execution-tool'
import type { ComputerUseTool } from './computer-use-tool'
import type { CustomTool } from './custom-tool'
import type { MemoryTool } from './memory-tool'
import type { TextEditorTool } from './text-editor-tool'
import type { WebFetchTool } from './web-fetch-tool'
import type { WebSearchTool } from './web-search-tool'

/**
 * Union of all Anthropic tool types supported by this adapter.
 * Includes GA tools (via ToolUnion) and beta-only tools that
 * have no GA equivalent yet.
 */
export type AnthropicTool =
  | ToolUnion
  | BashTool
  | CodeExecutionTool
  | ComputerUseTool
  | CustomTool
  | MemoryTool
  | TextEditorTool
  | WebFetchTool
  | WebSearchTool

// Export individual tool types
export type {
  // BashTool,
  // CodeExecutionTool,
  // ComputerUseTool,
  CustomTool,
  // MemoryTool,
  // TextEditorTool,
  // WebFetchTool,
  // WebSearchTool,
}
