import type { AnthropicBashTool } from './bash-tool'
import type { AnthropicCodeExecutionTool } from './code-execution-tool'
import type { AnthropicComputerUseTool } from './computer-use-tool'
import type { AnthropicCustomTool } from './custom-tool'
import type { AnthropicMemoryTool } from './memory-tool'
import type { AnthropicTextEditorTool } from './text-editor-tool'
import type { AnthropicWebFetchTool } from './web-fetch-tool'
import type { AnthropicWebSearchTool } from './web-search-tool'

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
  type AnthropicCustomTool,
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
  | AnthropicBashTool
  | AnthropicCodeExecutionTool
  | AnthropicComputerUseTool
  | AnthropicCustomTool
  | AnthropicMemoryTool
  | AnthropicTextEditorTool
  | AnthropicWebFetchTool
  | AnthropicWebSearchTool
