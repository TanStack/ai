import type { CodeExecutionToolConfig } from './code-execution-tool'
import type { ComputerUseToolConfig } from './computer-use-tool'
import type { FileSearchToolConfig } from './file-search-tool'
import type { FunctionDeclarationTool } from './function-declaration-tool'
import type { GoogleMapsToolConfig } from './google-maps-tool'
import type { GoogleSearchRetrievalToolConfig } from './google-search-retriveal-tool'
import type { GoogleSearchToolConfig } from './google-search-tool'
import type { UrlContextToolConfig } from './url-context-tool'

export {
  codeExecutionTool,
  type GeminiCodeExecutionTool,
  type CodeExecutionToolConfig,
} from './code-execution-tool'
export {
  computerUseTool,
  type GeminiComputerUseTool,
  type ComputerUseToolConfig,
} from './computer-use-tool'
export {
  fileSearchTool,
  type GeminiFileSearchTool,
  type FileSearchToolConfig,
} from './file-search-tool'
export {
  functionDeclarationTools,
  type FunctionDeclarationTool,
} from './function-declaration-tool'
export {
  googleMapsTool,
  type GeminiGoogleMapsTool,
  type GoogleMapsToolConfig,
} from './google-maps-tool'
export {
  googleSearchRetrievalTool,
  type GeminiGoogleSearchRetrievalTool,
  type GoogleSearchRetrievalToolConfig,
} from './google-search-retriveal-tool'
export {
  googleSearchTool,
  type GeminiGoogleSearchTool,
  type GoogleSearchToolConfig,
} from './google-search-tool'
export {
  urlContextTool,
  type GeminiUrlContextTool,
  type UrlContextToolConfig,
} from './url-context-tool'

// Keep the existing discriminated union defined inline (no barrel exports).
export type GoogleGeminiTool =
  | CodeExecutionToolConfig
  | ComputerUseToolConfig
  | FileSearchToolConfig
  | FunctionDeclarationTool
  | GoogleMapsToolConfig
  | GoogleSearchRetrievalToolConfig
  | GoogleSearchToolConfig
  | UrlContextToolConfig

export { convertToolsToProviderFormat } from './tool-converter'
