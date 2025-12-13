import type { Tool as AiTool } from '@tanstack/ai'
import type { Tool } from '@aws-sdk/client-bedrock-runtime'

export function convertWebSearchToolToAdapterFormat(
  _tool: AiTool,
): Tool {
  throw new Error(
    'The web_search tool is not supported on Amazon Bedrock. ' +
      'Please remove this tool from your configuration.',
  )
}
