import {  convertZodToJsonSchema } from '@tanstack/ai'
import { convertCodeExecutionToolToAdapterFormat } from './code-execution-tool'
import { convertComputerUseToolToAdapterFormat } from './computer-use-tool'
import { convertFileSearchToolToAdapterFormat } from './file-search-tool'
import { convertGoogleMapsToolToAdapterFormat } from './google-maps-tool'
import { convertGoogleSearchRetrievalToolToAdapterFormat } from './google-search-retriveal-tool'
import { convertGoogleSearchToolToAdapterFormat } from './google-search-tool'
import { convertUrlContextToolToAdapterFormat } from './url-context-tool'
import type {Tool} from '@tanstack/ai';
import type { ToolUnion } from '@google/genai'

/**
 * Converts standard Tool format to Gemini-specific tool format
 *
 * @param tools - Array of standard Tool objects
 * @returns Array of Gemini-specific tool definitions
 *
 * @example
 * ```typescript
 * const tools: Tool[] = [{
 *   name: "get_weather",
 *   description: "Get weather for a location",
 *   inputSchema: z.object({
 *     location: z.string()
 *   })
 * }];
 *
 * const geminiTools = convertToolsToProviderFormat(tools);
 * ```
 */
export function convertToolsToProviderFormat<TTool extends Tool>(
  tools: Array<TTool> | undefined,
): Array<ToolUnion> {
  if (!tools || tools.length === 0) {
    return []
  }
  const result: Array<ToolUnion> = []
  const functionDeclarations: Array<{
    name: string
    description?: string
    parameters?: any
  }> = []

  // Process each tool and group function declarations together
  for (const tool of tools) {
    const name = tool.name

    switch (name) {
      case 'code_execution':
        result.push(convertCodeExecutionToolToAdapterFormat(tool))
        break
      case 'computer_use':
        result.push(convertComputerUseToolToAdapterFormat(tool))
        break
      case 'file_search':
        result.push(convertFileSearchToolToAdapterFormat(tool))
        break
      case 'google_maps':
        result.push(convertGoogleMapsToolToAdapterFormat(tool))
        break
      case 'google_search_retrieval':
        result.push(convertGoogleSearchRetrievalToolToAdapterFormat(tool))
        break
      case 'google_search':
        result.push(convertGoogleSearchToolToAdapterFormat(tool))
        break
      case 'url_context':
        result.push(convertUrlContextToolToAdapterFormat(tool))
        break
      default:
        // Collect function declarations to group together
        // Description is required for Gemini function declarations
        if (!tool.description) {
          throw new Error(
            `Tool ${tool.name} requires a description for Gemini adapter`,
          )
        }

        // Convert Zod schema to JSON Schema
        const jsonSchema = convertZodToJsonSchema(tool.inputSchema)

        functionDeclarations.push({
          name: tool.name,
          description: tool.description,
          parameters: jsonSchema,
        })
        break
    }
  }

  // If we have function declarations, add them as a single tool
  if (functionDeclarations.length > 0) {
    result.push({
      functionDeclarations: functionDeclarations,
    })
  }

  return result
}
