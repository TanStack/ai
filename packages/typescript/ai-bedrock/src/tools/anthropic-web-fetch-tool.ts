import type { Tool as AiTool } from '@tanstack/ai'
import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

const WEB_FETCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string' },
  },
  required: ['url'],
} as const

export function convertWebFetchToolToAdapterFormat(
  tool: AiTool,
): Tool {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: WEB_FETCH_INPUT_SCHEMA as unknown as DocumentType,
      },
    },
  }
}
