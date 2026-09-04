import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import type { ContentPart, StreamChunk } from '../src/types'

function chunk<T extends StreamChunk['type']>(
  type: T,
  fields: Record<string, unknown>,
): Extract<StreamChunk, { type: T }> {
  return { type, timestamp: Date.now(), ...fields } as Extract<
    StreamChunk,
    { type: T }
  >
}

const MULTIMODAL_RESULT: Array<ContentPart> = [
  { type: 'text', content: 'Layout rule 1.' },
  {
    type: 'image',
    source: {
      type: 'data',
      value: 'iVBORw0KGgoAAAANSUhEUg==',
      mimeType: 'image/png',
    },
  },
]

describe('multimodal TOOL_CALL_RESULT round trip', () => {
  it('keeps structured content in the tool result metadata', () => {
    const processor = new StreamProcessor()
    const toolCallId = 'call-mm'

    processor.processChunk(
      chunk('TOOL_CALL_START', {
        toolCallId,
        toolCallName: 'getLayoutRules',
        parentMessageId: 'assistant-1',
      }),
    )
    processor.processChunk(
      chunk('TOOL_CALL_ARGS', { toolCallId, delta: '{}' }),
    )
    processor.processChunk(chunk('TOOL_CALL_END', { toolCallId }))
    processor.processChunk(
      chunk('TOOL_CALL_RESULT', {
        toolCallId,
        messageId: 'tool-result-1',
        content: JSON.stringify(MULTIMODAL_RESULT),
      }),
    )

    const toolResult = processor
      .getMessages()[0]!
      .parts.find((part) => part.type === 'tool-result')

    expect(toolResult?.content).toEqual(MULTIMODAL_RESULT)

    const wire = uiMessagesToWire(processor.getMessages())
    const toolMessage = wire.find((message) => message.role === 'tool')
    const metadata = toolMessage?.metadata as
      | {
          tanstack?: {
            toolResult?: { content?: Array<ContentPart> }
          }
        }
      | undefined

    expect(metadata?.tanstack?.toolResult?.content).toEqual(MULTIMODAL_RESULT)
  })
})
