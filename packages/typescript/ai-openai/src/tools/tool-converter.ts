import { convertApplyPatchToolToAdapterFormat } from './apply-patch-tool'
import { convertCodeInterpreterToolToAdapterFormat } from './code-interpreter-tool'
import { convertComputerUseToolToAdapterFormat } from './computer-use-tool'
import { convertCustomToolToAdapterFormat } from './custom-tool'
import { convertFileSearchToolToAdapterFormat } from './file-search-tool'
import { convertFunctionToolToAdapterFormat } from './function-tool'
import { convertImageGenerationToolToAdapterFormat } from './image-generation-tool'
import { convertLocalShellToolToAdapterFormat } from './local-shell-tool'
import { convertMCPToolToAdapterFormat } from './mcp-tool'
import { convertShellToolToAdapterFormat } from './shell-tool'
import { convertWebSearchPreviewToolToAdapterFormat } from './web-search-preview-tool'
import { convertWebSearchToolToAdapterFormat } from './web-search-tool'
import type { OpenAITool } from './index'
import type { Tool } from '@tanstack/ai'

/**
 * Converts an array of standard Tools to OpenAI-specific format
 */
export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<OpenAITool> {
  return tools.map((tool) => {
    // Special tool names that map to specific OpenAI tool types
    const specialToolNames = new Set([
      'apply_patch',
      'code_interpreter',
      'computer_use_preview',
      'file_search',
      'image_generation',
      'local_shell',
      'mcp',
      'shell',
      'web_search_preview',
      'web_search',
      'custom',
    ])

    const toolName = tool.function.name

    // If it's a special tool name, route to the appropriate converter
    if (specialToolNames.has(toolName)) {
      switch (toolName) {
        case 'apply_patch':
          return convertApplyPatchToolToAdapterFormat(tool)
        case 'code_interpreter':
          return convertCodeInterpreterToolToAdapterFormat(tool)
        case 'computer_use_preview':
          return convertComputerUseToolToAdapterFormat(tool)
        case 'file_search':
          return convertFileSearchToolToAdapterFormat(tool)
        case 'image_generation':
          return convertImageGenerationToolToAdapterFormat(tool)
        case 'local_shell':
          return convertLocalShellToolToAdapterFormat(tool)
        case 'mcp':
          return convertMCPToolToAdapterFormat(tool)
        case 'shell':
          return convertShellToolToAdapterFormat(tool)
        case 'web_search_preview':
          return convertWebSearchPreviewToolToAdapterFormat(tool)
        case 'web_search':
          return convertWebSearchToolToAdapterFormat(tool)
        case 'custom':
          return convertCustomToolToAdapterFormat(tool)
      }
    }

    // For regular function tools (not special names), convert as function tool
    // This handles tools like "getGuitars", "recommendGuitar", etc.
    return convertFunctionToolToAdapterFormat(tool)
  })
}
