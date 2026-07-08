import type { CodeExecutionTool } from './code-execution-tool'
import type { ComputerUseTool } from './computer-use-tool'
import type { FileSearchTool } from './file-search-tool'
import type { FunctionDeclarationTool } from './function-declaration-tool'
import type { GoogleMapsTool } from './google-maps-tool'
import type { GoogleSearchRetrievalTool } from './google-search-retriveal-tool'
import type { GoogleSearchTool } from './google-search-tool'
import type { UrlContextTool } from './url-context-tool'

export {
  codeExecutionTool,
  type GeminiCodeExecutionTool,
  type CodeExecutionToolConfig,
  type CodeExecutionTool,
} from './code-execution-tool'
export {
  computerUseTool,
  type GeminiComputerUseTool,
  type ComputerUseToolConfig,
  type ComputerUseTool,
} from './computer-use-tool'
export {
  fileSearchTool,
  type GeminiFileSearchTool,
  type FileSearchToolConfig,
  type FileSearchTool,
} from './file-search-tool'
export {
  functionDeclarationTools,
  type FunctionDeclarationTool,
} from './function-declaration-tool'
export {
  googleMapsTool,
  type GeminiGoogleMapsTool,
  type GoogleMapsToolConfig,
  type GoogleMapsTool,
} from './google-maps-tool'
export {
  googleSearchRetrievalTool,
  type GeminiGoogleSearchRetrievalTool,
  type GoogleSearchRetrievalToolConfig,
  type GoogleSearchRetrievalTool,
} from './google-search-retriveal-tool'
export {
  googleSearchTool,
  type GeminiGoogleSearchTool,
  type GoogleSearchToolConfig,
  type GoogleSearchTool,
} from './google-search-tool'
export {
  urlContextTool,
  type GeminiUrlContextTool,
  type UrlContextToolConfig,
  type UrlContextTool,
} from './url-context-tool'

// Keep the existing discriminated union defined inline (no barrel exports).
// Built from the deprecated config-type aliases — matches the SDK-adapter shape.
export type GoogleGeminiTool =
  | CodeExecutionTool
  | ComputerUseTool
  | FileSearchTool
  | FunctionDeclarationTool
  | GoogleMapsTool
  | GoogleSearchRetrievalTool
  | GoogleSearchTool
  | UrlContextTool

export { convertToolsToProviderFormat } from './tool-converter'
