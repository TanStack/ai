import type { Tool as AiTool } from '@tanstack/ai'
import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

const BASH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    restart: { type: 'boolean' },
  },
  required: ['command'],
} as const

export function convertBashToolToAdapterFormat(tool: AiTool): Tool {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: BASH_INPUT_SCHEMA as unknown as DocumentType,
      },
    },
  }
}
