import type { Tool } from '@tanstack/ai'
import type { BedrockToolSpec } from './custom-tool'

export function convertWebSearchToolToAdapterFormat(
  _tool: Tool,
): BedrockToolSpec {
  throw new Error(
    'The web_search tool is not supported on Amazon Bedrock. ' +
      'Please remove this tool from your configuration.',
  )
}
