import { convertZodToJsonSchema } from '@tanstack/ai'
import type { Tool as AiTool } from '@tanstack/ai'
import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

export function convertCustomToolToAdapterFormat(tool: AiTool): Tool {
  const jsonSchema = convertZodToJsonSchema(tool.inputSchema)

  return {
    toolSpec: {
      name: tool.name,
      ...(tool.description && { description: tool.description }),
      inputSchema: {
        json: (jsonSchema || { type: 'object', properties: {} }) as DocumentType,
      },
    },
  }
}
