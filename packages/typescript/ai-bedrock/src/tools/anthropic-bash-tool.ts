import type { Tool } from '@tanstack/ai'
import type { BedrockToolSpec } from './custom-tool'

const BASH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    restart: { type: 'boolean' },
  },
  required: ['command'],
} as const

export function convertBashToolToAdapterFormat(tool: Tool): BedrockToolSpec {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: BASH_INPUT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  }
}
