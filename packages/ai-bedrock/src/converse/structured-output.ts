import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

export const STRUCTURED_TOOL_NAME = 'structured_output'

/**
 * Converse has no native json_schema response_format. Structured output is
 * achieved by forcing a single tool whose input schema is the requested output
 * schema; the model's tool-use `input` is the structured result.
 */
export function buildStructuredToolConfig(schema: unknown): ToolConfiguration {
  return {
    tools: [
      {
        toolSpec: {
          name: STRUCTURED_TOOL_NAME,
          description: 'Return the final answer as structured JSON.',
          inputSchema: { json: schema as DocumentType },
        },
      },
    ],
    toolChoice: { tool: { name: STRUCTURED_TOOL_NAME } },
  }
}
