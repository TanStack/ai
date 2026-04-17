import type { BashTool } from './bash-tool'
import type { CodeExecutionTool } from './code-execution-tool'
import type { ComputerUseTool } from './computer-use-tool'
import type { CustomTool } from './custom-tool'
import type { MemoryTool } from './memory-tool'
import type { TextEditorTool } from './text-editor-tool'
import type { WebFetchTool } from './web-fetch-tool'
import type { WebSearchTool } from './web-search-tool'

export {
  bashTool,
  type AnthropicBashTool,
  type BashToolConfig,
  type BashTool,
} from './bash-tool'
export {
  codeExecutionTool,
  type AnthropicCodeExecutionTool,
  type CodeExecutionToolConfig,
  type CodeExecutionTool,
} from './code-execution-tool'
export {
  computerUseTool,
  type AnthropicComputerUseTool,
  type ComputerUseToolConfig,
  type ComputerUseTool,
} from './computer-use-tool'
export {
  customTool,
  type CustomToolConfig,
  type CustomTool,
} from './custom-tool'
export {
  memoryTool,
  type AnthropicMemoryTool,
  type MemoryToolConfig,
  type MemoryTool,
} from './memory-tool'
export {
  textEditorTool,
  type AnthropicTextEditorTool,
  type TextEditorToolConfig,
  type TextEditorTool,
} from './text-editor-tool'
export {
  webFetchTool,
  type AnthropicWebFetchTool,
  type WebFetchToolConfig,
  type WebFetchTool,
} from './web-fetch-tool'
export {
  webSearchTool,
  type AnthropicWebSearchTool,
  type WebSearchToolConfig,
  type WebSearchTool,
} from './web-search-tool'

// Keep the discriminated union defined inline (no barrel exports).
export type AnthropicTool =
  | BashTool
  | CodeExecutionTool
  | ComputerUseTool
  | CustomTool
  | MemoryTool
  | TextEditorTool
  | WebFetchTool
  | WebSearchTool
