import type { BashToolConfig } from './bash-tool'
import type { CodeExecutionToolConfig } from './code-execution-tool'
import type { ComputerUseToolConfig } from './computer-use-tool'
import type { CustomToolConfig } from './custom-tool'
import type { MemoryToolConfig } from './memory-tool'
import type { TextEditorToolConfig } from './text-editor-tool'
import type { WebFetchToolConfig } from './web-fetch-tool'
import type { WebSearchToolConfig } from './web-search-tool'

export {
  bashTool,
  type AnthropicBashTool,
  type BashToolConfig,
} from './bash-tool'
export {
  codeExecutionTool,
  convertCodeExecutionToolToAdapterFormat,
  readCodeExecutionConfig,
  readCodeExecutionSkills,
  type AnthropicCodeExecutionTool,
  type AnthropicContainerSkill,
  type CodeExecutionToolConfig,
  type CodeExecutionToolOptions,
} from './code-execution-tool'
export {
  computerUseTool,
  type AnthropicComputerToolset,
  type AnthropicComputerUse20251124Tool,
  type AnthropicComputerUseTool,
  type ComputerToolsetConfig,
  type ComputerUseSingleToolConfig,
  type ComputerUseToolConfig,
} from './computer-use-tool'
export { customTool, type CustomToolConfig } from './custom-tool'
export {
  memoryTool,
  type AnthropicMemoryTool,
  type MemoryToolConfig,
} from './memory-tool'
export {
  textEditorTool,
  type AnthropicTextEditorTool,
  type TextEditorToolConfig,
} from './text-editor-tool'
export {
  webFetchTool,
  type AnthropicWebFetchTool,
  type WebFetchToolConfig,
} from './web-fetch-tool'
export {
  webSearchTool,
  type AnthropicWebSearchTool,
  type WebSearchToolConfig,
} from './web-search-tool'

// Keep the discriminated union defined inline (no barrel exports).
export type AnthropicTool =
  | BashToolConfig
  | CodeExecutionToolConfig
  | ComputerUseToolConfig
  | CustomToolConfig
  | MemoryToolConfig
  | TextEditorToolConfig
  | WebFetchToolConfig
  | WebSearchToolConfig
