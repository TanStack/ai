import type { Tool as AiTool } from '@tanstack/ai'
import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

const CODE_EXECUTION_INPUT_SCHEMA_20250522 = {
  type: 'object',
  properties: {
    code: { type: 'string' },
  },
  required: ['code'],
} as const

const CODE_EXECUTION_INPUT_SCHEMA_20250825 = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { type: 'string', const: 'bash_code_execution' },
        command: { type: 'string' },
      },
      required: ['type', 'command'],
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', const: 'text_editor_code_execution' },
        command: { type: 'string', enum: ['view', 'create', 'str_replace'] },
        path: { type: 'string' },
        file_text: { type: 'string' },
        old_str: { type: 'string' },
        new_str: { type: 'string' },
      },
      required: ['type', 'command', 'path'],
    },
  ],
} as const

export function convertCodeExecutionToolToAdapterFormat(
  tool: AiTool,
): Tool {
  const metadata = tool.metadata as { type?: string } | undefined
  const toolType = metadata?.type

  const schema =
    toolType === 'code_execution_20250825'
      ? CODE_EXECUTION_INPUT_SCHEMA_20250825
      : CODE_EXECUTION_INPUT_SCHEMA_20250522

  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: schema as unknown as DocumentType,
      },
    },
  }
}
