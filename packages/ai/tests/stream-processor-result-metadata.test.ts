import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import {
  modelMessagesToUIMessages,
  uiMessageToModelMessages,
} from '../src/activities/chat/messages'
import { EventType } from '../src/types'
import { ev } from './test-utils'
import type {
  ModelMessage,
  StreamChunk,
  ToolCallPart,
  ToolCallResultEvent,
  ToolResultPart,
  UIMessage,
} from '../src/types'

const sources = [{ url: 'https://example.com/a', title: 'A' }]
const fullMetadata = {
  sources,
  tanstack: { state: 'output-available' },
}

function toolResultChunk(
  metadata: ToolCallResultEvent['metadata'],
): ToolCallResultEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: 'result-tc-1',
    toolCallId: 'tc-1',
    content: '{"answer":42}',
    timestamp: Date.now(),
    ...(metadata !== undefined && { metadata }),
  }
}

function streamToolResult(metadata: ToolCallResultEvent['metadata']) {
  const processor = new StreamProcessor()
  processor.processChunk(ev.toolStart('tc-1', 'search'))
  processor.processChunk(ev.toolArgs('tc-1', '{}'))
  processor.processChunk(ev.toolEnd('tc-1'))
  processor.processChunk(toolResultChunk(metadata))
  return processor.getMessages()[0]!
}

function toolRow(metadata: ModelMessage['metadata']): ModelMessage {
  return {
    role: 'tool',
    toolCallId: 'tc-1',
    content: '{"answer":42}',
    ...(metadata !== undefined && { metadata }),
  }
}

/** Convert an assistant call `tc-1` and the tool rows for it. */
function reloadToolRows(...rows: Array<ModelMessage>) {
  const messages: Array<ModelMessage> = [
    {
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: 'tc-1',
          type: 'function',
          function: { name: 'search', arguments: '{}' },
        },
      ],
    },
    ...rows,
  ]
  return modelMessagesToUIMessages(messages)[0]!
}

function reloadToolResult(metadata: ModelMessage['metadata']) {
  return reloadToolRows(toolRow(metadata))
}

function toolCallPart(message: UIMessage) {
  return message.parts.find(
    (part): part is ToolCallPart => part.type === 'tool-call',
  )
}

function toolResultPart(message: UIMessage) {
  return message.parts.find(
    (part): part is ToolResultPart => part.type === 'tool-result',
  )
}

describe.each([
  ['TOOL_CALL_RESULT stream', streamToolResult],
  ['modelMessagesToUIMessages reload', reloadToolResult],
])('tool result metadata on the %s', (_name, build) => {
  it('puts only the app keys on the tool-call part', () => {
    const message = build(fullMetadata)

    expect(toolCallPart(message)?.resultMetadata).toEqual({ sources })
    expect(toolResultPart(message)?.metadata).toEqual(fullMetadata)
  })

  it('sets no resultMetadata when only the tanstack key is present', () => {
    const message = build({ tanstack: { state: 'output-available' } })

    expect(toolCallPart(message)).not.toHaveProperty('resultMetadata')
  })
})

describe('tool result metadata in UI to model conversion', () => {
  it('does not send resultMetadata from the tool-call part', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: 'tc-1',
          name: 'search',
          arguments: '{}',
          state: 'input-complete',
          output: { answer: 42 },
          resultMetadata: { sources },
        },
      ],
    }

    expect(uiMessageToModelMessages(message)).toEqual([
      {
        id: 'msg-1',
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'tc-1',
            type: 'function',
            function: { name: 'search', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', content: '{"answer":42}', toolCallId: 'tc-1' },
    ])
  })
})

describe('tool result metadata after MESSAGES_SNAPSHOT', () => {
  const snapshot = {
    type: EventType.MESSAGES_SNAPSHOT,
    timestamp: Date.now(),
    messages: [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'tc-1',
            type: 'function',
            function: { name: 'search', arguments: '{}' },
          },
        ],
      },
      {
        id: 'result-tc-1',
        role: 'tool',
        toolCallId: 'tc-1',
        content: '{"answer":42}',
        metadata: fullMetadata,
      },
    ],
  } satisfies StreamChunk

  it('fills resultMetadata from the snapshot tool row', () => {
    const processor = new StreamProcessor()
    processor.processChunk(snapshot)
    const call = processor
      .getMessages()
      .flatMap((message) => message.parts)
      .find((part): part is ToolCallPart => part.type === 'tool-call')
    expect(call?.resultMetadata).toEqual({ sources })
  })

  it('keeps resultMetadata that the stream set before the snapshot', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.toolStart('tc-1', 'search'))
    processor.processChunk(ev.toolArgs('tc-1', '{}'))
    processor.processChunk(ev.toolEnd('tc-1'))
    processor.processChunk(toolResultChunk(fullMetadata))
    processor.processChunk({
      ...snapshot,
      messages: snapshot.messages.slice(0, 1),
    })
    const call = processor
      .getMessages()
      .flatMap((message) => message.parts)
      .find((part): part is ToolCallPart => part.type === 'tool-call')
    expect(call?.resultMetadata).toEqual({ sources })
  })
})

describe('a second tool result', () => {
  it('replaces the old resultMetadata, also when it has none', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.toolStart('tc-1', 'search'))
    processor.processChunk(ev.toolArgs('tc-1', '{}'))
    processor.processChunk(ev.toolEnd('tc-1'))
    processor.processChunk(toolResultChunk(fullMetadata))
    processor.processChunk(toolResultChunk(undefined))
    const message = processor.getMessages()[0]!
    expect(toolCallPart(message)).not.toHaveProperty('resultMetadata')
    expect(toolResultPart(message)?.metadata).not.toHaveProperty('sources')
  })

  it('replaces the old resultMetadata on reload, also when it has none', () => {
    const message = reloadToolRows(
      toolRow(fullMetadata),
      toolRow({ tanstack: { state: 'output-available' } }),
    )
    expect(toolCallPart(message)).not.toHaveProperty('resultMetadata')
  })
})
