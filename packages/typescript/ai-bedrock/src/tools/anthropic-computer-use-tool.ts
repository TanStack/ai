import type { Tool } from '@tanstack/ai'
import type { BedrockToolSpec } from './custom-tool'

const COMPUTER_USE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'key',
        'hold_key',
        'type',
        'cursor_position',
        'mouse_move',
        'left_mouse_down',
        'left_mouse_up',
        'left_click',
        'left_click_drag',
        'right_click',
        'middle_click',
        'double_click',
        'triple_click',
        'scroll',
        'wait',
        'screenshot',
      ],
    },
    coordinate: {
      type: 'array',
      items: { type: 'integer' },
    },
    duration: { type: 'number' },
    scroll_amount: { type: 'number' },
    scroll_direction: {
      type: 'string',
      enum: ['up', 'down', 'left', 'right'],
    },
    start_coordinate: {
      type: 'array',
      items: { type: 'integer' },
    },
    text: { type: 'string' },
  },
  required: ['action'],
} as const

export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): BedrockToolSpec {
  return {
    toolSpec: {
      name: tool.name,
      inputSchema: {
        json: COMPUTER_USE_INPUT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  }
}
