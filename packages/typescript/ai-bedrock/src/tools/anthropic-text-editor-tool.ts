import type { Tool } from '@tanstack/ai'
import type { BedrockToolSpec } from './custom-tool'

const TEXT_EDITOR_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      enum: ['view', 'create', 'str_replace', 'insert', 'undo_edit'],
    },
    path: { type: 'string' },
    file_text: { type: 'string' },
    insert_line: { type: 'integer' },
    new_str: { type: 'string' },
    old_str: { type: 'string' },
    view_range: {
      type: 'array',
      items: { type: 'integer' },
    },
  },
  required: ['command', 'path'],
} as const

export function convertTextEditorToolToAdapterFormat(
  tool: Tool,
): BedrockToolSpec {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: TEXT_EDITOR_INPUT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  }
}
