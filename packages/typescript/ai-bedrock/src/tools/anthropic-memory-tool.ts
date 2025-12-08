import type { Tool as AiTool } from '@tanstack/ai'
import type { Tool } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

const MEMORY_INPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      properties: {
        command: { type: 'string', const: 'view' },
        path: { type: 'string' },
        view_range: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
      },
      required: ['command', 'path'],
    },
    {
      type: 'object',
      properties: {
        command: { type: 'string', const: 'create' },
        path: { type: 'string' },
        file_text: { type: 'string' },
      },
      required: ['command', 'path', 'file_text'],
    },
    {
      type: 'object',
      properties: {
        command: { type: 'string', const: 'str_replace' },
        path: { type: 'string' },
        old_str: { type: 'string' },
        new_str: { type: 'string' },
      },
      required: ['command', 'path', 'old_str', 'new_str'],
    },
    {
      type: 'object',
      properties: {
        command: { type: 'string', const: 'insert' },
        path: { type: 'string' },
        insert_line: { type: 'number' },
        insert_text: { type: 'string' },
      },
      required: ['command', 'path', 'insert_line', 'insert_text'],
    },
    {
      type: 'object',
      properties: {
        command: { type: 'string', const: 'delete' },
        path: { type: 'string' },
      },
      required: ['command', 'path'],
    },
    {
      type: 'object',
      properties: {
        command: { type: 'string', const: 'rename' },
        old_path: { type: 'string' },
        new_path: { type: 'string' },
      },
      required: ['command', 'old_path', 'new_path'],
    },
  ],
} as const

export function convertMemoryToolToAdapterFormat(tool: AiTool): Tool {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: MEMORY_INPUT_SCHEMA as unknown as DocumentType,
      },
    },
  }
}
