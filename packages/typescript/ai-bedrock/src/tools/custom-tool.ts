import { convertZodToJsonSchema } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'

export interface BedrockToolSpec {
  toolSpec: {
    name: string
    description?: string
    inputSchema: { json: Record<string, unknown> }
  }
}

export function convertCustomToolToAdapterFormat(tool: Tool): BedrockToolSpec {
  const jsonSchema = convertZodToJsonSchema(tool.inputSchema)

  return {
    toolSpec: {
      name: tool.name,
      ...(tool.description && { description: tool.description }),
      inputSchema: {
        json: jsonSchema || { type: 'object', properties: {} },
      },
    },
  }
}
