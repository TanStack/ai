import type { CodeExecutionToolConfig, CodeInterpreterToolConfig } from './code-execution-tool'
import type { CollectionsSearchToolConfig, FileSearchToolConfig } from './file-search-tool'
import type { FunctionTool } from './function-tool'
import type { MCPToolConfig } from './mcp-tool'
import type { WebSearchToolConfig } from './web-search-tool'
import type { XSearchToolConfig } from './x-search-tool'

export type GrokTool =
  | CodeExecutionToolConfig
  | CodeInterpreterToolConfig
  | CollectionsSearchToolConfig
  | FileSearchToolConfig
  | FunctionTool
  | MCPToolConfig
  | WebSearchToolConfig
  | XSearchToolConfig

export {
  codeExecutionTool,
  codeInterpreterTool,
  convertCodeExecutionToolToAdapterFormat,
  convertCodeInterpreterToolToAdapterFormat,
  type CodeExecutionToolConfig,
  type CodeExecutionToolOptions,
  type CodeExecutionTool,
  type GrokCodeExecutionTool,
  type CodeInterpreterToolConfig,
  type GrokCodeInterpreterTool,
} from './code-execution-tool'
export {
  collectionsSearchTool,
  convertCollectionsSearchToolToAdapterFormat,
  convertFileSearchToolToAdapterFormat,
  fileSearchTool,
  type CollectionsSearchToolConfig,
  type CollectionsSearchToolOptions,
  type CollectionsSearchTool,
  type FileSearchToolConfig,
  type FileSearchToolOptions,
  type FileSearchTool,
  type GrokCollectionsSearchTool,
  type GrokFileSearchTool,
} from './file-search-tool'
export {
  convertFunctionToolToAdapterFormat,
  type FunctionTool,
} from './function-tool'
export {
  convertMCPToolToAdapterFormat,
  mcpTool,
  validateMCPTool,
  type GrokMCPTool,
  type MCPTool,
  type MCPToolConfig,
} from './mcp-tool'
export {
  convertWebSearchToolToAdapterFormat,
  webSearchTool,
  type GrokWebSearchTool,
  type WebSearchTool,
  type WebSearchToolConfig,
  type WebSearchToolOptions,
} from './web-search-tool'
export {
  convertXSearchToolToAdapterFormat,
  xSearchTool,
  type GrokXSearchTool,
  type XSearchTool,
  type XSearchToolConfig,
  type XSearchToolOptions,
} from './x-search-tool'
export { convertToolsToProviderFormat } from './tool-converter'
