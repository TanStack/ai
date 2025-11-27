import type { CodeExecutionTool } from './code-execution-tool'
import type { ComputerUseTool } from './computer-use-tool'
import type { FileSearchTool } from './file-search-tool'
import type { FunctionDeclarationTool } from './function-declaration-tool'
import type { GoogleMapsTool } from './google-maps-tool'
import type { GoogleSearchRetrievalTool } from './google-search-retriveal-tool'
import type { GoogleSearchTool } from './google-search-tool'
import type { UrlContextTool } from './url-context-tool'

export type GoogleGeminiTool =
  | CodeExecutionTool
  | ComputerUseTool
  | FileSearchTool
  | FunctionDeclarationTool
  | GoogleMapsTool
  | GoogleSearchRetrievalTool
  | GoogleSearchTool
  | UrlContextTool
