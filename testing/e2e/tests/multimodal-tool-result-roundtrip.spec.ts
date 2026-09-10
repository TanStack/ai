import {
  StreamProcessor,
  uiMessagesToWire,
  type ContentPart,
  type StreamChunk,
} from '@tanstack/ai'
import { test, expect } from './fixtures'

function chunk<T extends StreamChunk['type']>(
  type: T,
  fields: Record<string, unknown>,
): Extract<StreamChunk, { type: T }> {
  return { type, timestamp: Date.now(), ...fields } as Extract<
    StreamChunk,
    { type: T }
  >
}

test('multimodal TOOL_CALL_RESULT keeps structured content on the wire', () => {
  const content: Array<ContentPart> = [
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
  const processor = new StreamProcessor()
  const toolCallId = 'call-mm'

  processor.processChunk(
    chunk('TOOL_CALL_START', {
      toolCallId,
      toolCallName: 'getLayoutRules',
      parentMessageId: 'assistant-1',
    }),
  )
  processor.processChunk(chunk('TOOL_CALL_ARGS', { toolCallId, delta: '{}' }))
  processor.processChunk(chunk('TOOL_CALL_END', { toolCallId }))
  processor.processChunk(
    chunk('TOOL_CALL_RESULT', {
      toolCallId,
      messageId: 'tool-result-1',
      content: JSON.stringify(content),
    }),
  )

  const toolMessage = uiMessagesToWire(processor.getMessages()).find(
    (message) => message.role === 'tool',
  )
  const metadata = toolMessage?.metadata as
    | {
        tanstack?: {
          toolResult?: { content?: Array<ContentPart> }
        }
      }
    | undefined

  expect(metadata?.tanstack?.toolResult?.content).toEqual(content)
})
