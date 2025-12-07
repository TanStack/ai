import type { Tool } from '@tanstack/ai'
import type { BedrockToolSpec } from './custom-tool'

const WEB_FETCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string' },
  },
  required: ['url'],
} as const

export function convertWebFetchToolToAdapterFormat(
  tool: Tool,
): BedrockToolSpec {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: WEB_FETCH_INPUT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  }
}
