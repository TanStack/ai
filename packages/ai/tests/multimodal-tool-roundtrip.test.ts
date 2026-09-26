/**
 * Regression tests for #1283.
 *
 * The server sends a `ContentPart[]` tool result on TOOL_CALL_RESULT as a JSON
 * string. The client must keep the array on the tool-result part, so the next
 * request carries it and the server restores it for the adapter.
 */
import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { convertMessagesToModelMessages } from '../src/activities/chat/messages'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import { chatParamsFromRequestBody } from '../src/utilities/chat-params'
import { EventType } from '../src/types'
import type { ContentPart, StreamChunk } from '../src/types'

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

function processToolResult(content: string): StreamProcessor {
  const processor = new StreamProcessor()
  const toolCallId = 'call-mm'
  const chunks: Array<StreamChunk> = [
    {
      type: EventType.TOOL_CALL_START,
      timestamp: 0,
      toolCallId,
      toolCallName: 'getLayoutRules',
      parentMessageId: 'assistant-1',
    },
    { type: EventType.TOOL_CALL_ARGS, timestamp: 0, toolCallId, delta: '{}' },
    { type: EventType.TOOL_CALL_END, timestamp: 0, toolCallId },
    {
      type: EventType.TOOL_CALL_RESULT,
      timestamp: 0,
      toolCallId,
      messageId: 'tool-result-1',
      content,
    },
  ]
  for (const chunk of chunks) processor.processChunk(chunk)
  return processor
}

function toolResultPart(processor: StreamProcessor) {
  return processor
    .getMessages()
    .flatMap((message) => message.parts)
    .find((part) => part.type === 'tool-result')
}

describe('multimodal TOOL_CALL_RESULT round trip (#1283)', () => {
  it('keeps a ContentPart[] result as an array through the next request', async () => {
    const processor = processToolResult(JSON.stringify(MULTIMODAL_RESULT))

    expect(toolResultPart(processor)?.content).toEqual(MULTIMODAL_RESULT)

    // Client -> HTTP (JSON) -> server, as the next request does.
    const body = JSON.parse(
      JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-2',
        state: {},
        messages: uiMessagesToWire(processor.getMessages()),
        tools: [],
        context: [],
        forwardedProps: {},
      }),
    )
    const params = await chatParamsFromRequestBody(body)
    const toolMessage = convertMessagesToModelMessages(params.messages).find(
      (message) => message.role === 'tool',
    )

    expect(toolMessage?.content).toEqual(MULTIMODAL_RESULT)
  })

  it('keeps a plain JSON result as the original string', () => {
    const content = '{ "temp": 72 }'
    const processor = processToolResult(content)

    expect(toolResultPart(processor)?.content).toBe(content)
  })
})
