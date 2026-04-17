// Keep the existing discriminated union defined inline.
// Built from the deprecated config-type aliases — matches the SDK shape that
// `convertToolsToProviderFormat` emits.
import type { ApplyPatchTool } from './apply-patch-tool'
import type { CodeInterpreterTool } from './code-interpreter-tool'
import type { ComputerUseTool } from './computer-use-tool'
import type { CustomTool } from './custom-tool'
import type { FileSearchTool } from './file-search-tool'
import type { FunctionTool } from './function-tool'
import type { ImageGenerationTool } from './image-generation-tool'
import type { LocalShellTool } from './local-shell-tool'
import type { MCPTool } from './mcp-tool'
import type { ShellTool } from './shell-tool'
import type { WebSearchPreviewTool } from './web-search-preview-tool'
import type { WebSearchTool } from './web-search-tool'

export type OpenAITool =
  | ApplyPatchTool
  | CodeInterpreterTool
  | ComputerUseTool
  | CustomTool
  | FileSearchTool
  | FunctionTool
  | ImageGenerationTool
  | LocalShellTool
  | MCPTool
  | ShellTool
  | WebSearchPreviewTool
  | WebSearchTool

export {
  applyPatchTool,
  convertApplyPatchToolToAdapterFormat,
  type OpenAIApplyPatchTool,
  type ApplyPatchToolConfig,
  type ApplyPatchTool,
} from './apply-patch-tool'
export {
  codeInterpreterTool,
  convertCodeInterpreterToolToAdapterFormat,
  type OpenAICodeInterpreterTool,
  type CodeInterpreterToolConfig,
  type CodeInterpreterTool,
} from './code-interpreter-tool'
export {
  computerUseTool,
  convertComputerUseToolToAdapterFormat,
  type OpenAIComputerUseTool,
  type ComputerUseToolConfig,
  type ComputerUseTool,
} from './computer-use-tool'
export {
  customTool,
  convertCustomToolToAdapterFormat,
  type CustomToolConfig,
  type CustomTool,
} from './custom-tool'
export {
  fileSearchTool,
  convertFileSearchToolToAdapterFormat,
  type OpenAIFileSearchTool,
  type FileSearchToolConfig,
  type FileSearchTool,
} from './file-search-tool'
export {
  convertFunctionToolToAdapterFormat,
  type FunctionToolConfig,
  type FunctionTool,
} from './function-tool'
export {
  imageGenerationTool,
  convertImageGenerationToolToAdapterFormat,
  type OpenAIImageGenerationTool,
  type ImageGenerationToolConfig,
  type ImageGenerationTool,
} from './image-generation-tool'
export {
  localShellTool,
  convertLocalShellToolToAdapterFormat,
  type OpenAILocalShellTool,
  type LocalShellToolConfig,
  type LocalShellTool,
} from './local-shell-tool'
export {
  mcpTool,
  validateMCPtool,
  convertMCPToolToAdapterFormat,
  type OpenAIMCPTool,
  type MCPToolConfig,
  type MCPTool,
} from './mcp-tool'
export {
  shellTool,
  convertShellToolToAdapterFormat,
  type OpenAIShellTool,
  type ShellToolConfig,
  type ShellTool,
} from './shell-tool'
export {
  webSearchPreviewTool,
  convertWebSearchPreviewToolToAdapterFormat,
  type OpenAIWebSearchPreviewTool,
  type WebSearchPreviewToolConfig,
  type WebSearchPreviewTool,
} from './web-search-preview-tool'
export {
  webSearchTool,
  convertWebSearchToolToAdapterFormat,
  type OpenAIWebSearchTool,
  type WebSearchToolConfig,
  type WebSearchTool,
} from './web-search-tool'

export { type ToolChoice } from './tool-choice'
export { convertToolsToProviderFormat } from './tool-converter'
