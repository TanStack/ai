export { type OpenAITool } from '@tanstack/openai-base'

export {
  applyPatchTool,
  convertApplyPatchToolToAdapterFormat,
  type OpenAIApplyPatchTool,
  type ApplyPatchToolConfig,
} from './apply-patch-tool'
export {
  codeInterpreterTool,
  convertCodeInterpreterToolToAdapterFormat,
  type OpenAICodeInterpreterTool,
  type CodeInterpreterToolConfig,
} from './code-interpreter-tool'
export {
  computerUseTool,
  convertComputerUseToolToAdapterFormat,
  type OpenAIComputerUseTool,
  type ComputerUseToolConfig,
} from './computer-use-tool'
export {
  customTool,
  convertCustomToolToAdapterFormat,
  type CustomToolConfig,
} from './custom-tool'
export {
  fileSearchTool,
  convertFileSearchToolToAdapterFormat,
  type OpenAIFileSearchTool,
  type FileSearchToolConfig,
} from './file-search-tool'
export {
  convertFunctionToolToAdapterFormat,
  type FunctionToolConfig,
} from './function-tool'
export {
  imageGenerationTool,
  convertImageGenerationToolToAdapterFormat,
  type OpenAIImageGenerationTool,
  type ImageGenerationToolConfig,
} from './image-generation-tool'
export {
  localShellTool,
  convertLocalShellToolToAdapterFormat,
  type OpenAILocalShellTool,
  type LocalShellToolConfig,
} from './local-shell-tool'
export {
  mcpTool,
  validateMCPtool,
  convertMCPToolToAdapterFormat,
  type OpenAIMCPTool,
  type MCPToolConfig,
} from './mcp-tool'
export {
  shellTool,
  convertShellToolToAdapterFormat,
  type OpenAIShellTool,
  type ShellToolConfig,
} from './shell-tool'
export {
  webSearchPreviewTool,
  convertWebSearchPreviewToolToAdapterFormat,
  type OpenAIWebSearchPreviewTool,
  type WebSearchPreviewToolConfig,
} from './web-search-preview-tool'
export {
  webSearchTool,
  convertWebSearchToolToAdapterFormat,
  type OpenAIWebSearchTool,
  type WebSearchToolConfig,
} from './web-search-tool'

export { type ToolChoice } from './tool-choice'
export { convertToolsToProviderFormat } from './tool-converter'
