import { describe, it, expect } from 'vitest'
import type { MessagesSnapshotEvent } from '@ag-ui/core'
import { convertMessagesToModelMessages } from '../src/activities/chat/messages'
import { uiMessagesToWire, type WireMessage } from '../src/utilities/ag-ui-wire'
import type { ModelMessage, UIMessage } from '../src/types'

// @ts-expect-error system wire messages require content
const systemWithoutContent: WireMessage = { id: 'system', role: 'system' }
// @ts-expect-error user wire messages require content
const userWithoutContent: WireMessage = { id: 'user', role: 'user' }
const activityMessage: WireMessage = {
  id: 'activity',
  // @ts-expect-error uiMessagesToWire never emits activity messages
  role: 'activity',
  activityType: 'status',
  content: '',
}
void systemWithoutContent
void userWithoutContent
void activityMessage

function anchorContent(
  wire: Array<WireMessage>,
  role: 'user' | 'assistant' | 'system',
) {
  const message = wire.find((item) => item.role === role)
  if (
    message == null ||
    message.role === 'tool' ||
    message.role === 'reasoning'
  ) {
    throw new Error(`missing ${role} wire message`)
  }
  return message.content
}

describe('uiMessagesToWire', () => {
  it('returns messages that assign directly to an AG-UI snapshot', () => {
    const input: Array<UIMessage> = [
      {
        id: 'system',
        role: 'system',
        parts: [{ type: 'text', content: 'You are helpful' }],
      },
      {
        id: 'user',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
      },
    ]
    const messages: MessagesSnapshotEvent['messages'] = uiMessagesToWire(input)

    expect(messages).toHaveLength(2)
  })

  it('mirrors a system UIMessage to a string content field', () => {
    const messages: Array<UIMessage> = [
      {
        id: 's1',
        role: 'system',
        parts: [{ type: 'text', content: 'You are helpful' }],
      },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire).toHaveLength(1)
    expect(wire[0]!).toMatchObject({
      id: 's1',
      role: 'system',
      content: 'You are helpful',
    })
    expect(wire[0]).not.toHaveProperty('parts')
  })

  it('mirrors a user UIMessage with a text-only parts list to a string content', () => {
    const messages: Array<UIMessage> = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire).toHaveLength(1)
    expect(wire[0]!).toMatchObject({ id: 'u1', role: 'user', content: 'hi' })
  })

  it('mirrors a user UIMessage with mixed multimodal parts to an InputContent[] content', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', content: 'look at this' },
          {
            type: 'image',
            source: {
              type: 'url',
              value: 'https://example.com/cat.png',
              mimeType: 'image/png',
            },
          },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire).toHaveLength(1)
    const content = anchorContent(wire, 'user')
    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) {
      throw new Error('expected multimodal user content')
    }
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({
      type: 'text',
      text: 'look at this',
    })
    expect(content[1]).toMatchObject({
      type: 'image',
      source: {
        type: 'url',
        value: 'https://example.com/cat.png',
        mimeType: 'image/png',
      },
    })
  })

  it('emits assistant anchor with toolCalls mirror and a separate tool fan-out per ToolResultPart', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'ok' },
          {
            type: 'tool-call',
            id: 'tc1',
            name: 'getTodos',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            content: '[]',
            state: 'complete',
          },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire).toHaveLength(2)
    // Anchor
    expect(wire[0]!).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'ok',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'getTodos', arguments: '{}' },
        },
      ],
    })
    // Fan-out tool message
    expect(wire[1]!).toMatchObject({
      role: 'tool',
      toolCallId: 'tc1',
      content: '[]',
    })
  })

  it('fans out two output-only tool calls with unique tool-owned ids', () => {
    const wire = uiMessagesToWire([
      {
        id: 'assistant-1',
        name: 'assistant-name',
        role: 'assistant',
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'first',
            arguments: '{}',
            state: 'complete',
            output: { value: 1 },
          },
          {
            type: 'tool-call',
            id: 'call-2',
            name: 'second',
            arguments: '{}',
            state: 'complete',
            output: { value: 2 },
          },
        ],
      },
    ])

    expect(wire).toHaveLength(3)
    expect(wire.slice(1)).toEqual([
      {
        id: 'tool-call-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '{"value":1}',
        metadata: { tanstack: { toolResult: {} } },
      },
      {
        id: 'tool-call-2',
        role: 'tool',
        toolCallId: 'call-2',
        content: '{"value":2}',
        metadata: { tanstack: { toolResult: {} } },
      },
    ])
  })

  it('fans out an approval result without assistant identity fields', () => {
    const wire = uiMessagesToWire([
      {
        id: 'assistant-1',
        name: 'assistant-name',
        role: 'assistant',
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        parts: [
          {
            type: 'tool-call',
            id: 'call-approval',
            name: 'removeItem',
            arguments: '{}',
            state: 'approval-responded',
            approval: {
              id: 'approval-1',
              needsApproval: true,
              approved: false,
            },
          },
        ],
      },
    ])

    expect(wire[1]).toEqual({
      id: 'tool-call-approval',
      role: 'tool',
      toolCallId: 'call-approval',
      content: JSON.stringify({
        approved: false,
        message: 'User denied this action',
      }),
      metadata: { tanstack: { toolResult: {} } },
    })
  })

  it('preserves multimodal output-only content in tool ownership metadata', () => {
    const content = [
      { type: 'text' as const, content: 'result' },
      {
        type: 'image' as const,
        source: {
          type: 'url' as const,
          value: 'https://example.com/result.png',
        },
      },
    ]
    const wire = uiMessagesToWire([
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-image',
            name: 'createImage',
            arguments: '{}',
            state: 'complete',
            output: content,
          },
        ],
      },
    ])

    expect(wire[1]).toEqual({
      id: 'tool-call-image',
      role: 'tool',
      toolCallId: 'call-image',
      content: JSON.stringify(content),
      metadata: { tanstack: { toolResult: { content } } },
    })
  })

  it('preserves tool metadata and multimodal content through JSON wire data', () => {
    const createdAt = new Date('2026-08-20T00:00:00.000Z')
    const content = [
      { type: 'text' as const, content: 'result' },
      {
        type: 'image' as const,
        source: {
          type: 'url' as const,
          value: 'https://example.com/result.png',
        },
      },
    ]
    const metadata = {
      source: 'test',
      createdAt: 'metadata-date',
      nested: { createdAt: 'nested-date' },
      tanstack: {
        createdAt: 'tanstack-date',
        uiResources: [{ type: 'ui-resource', resource: { value: 1 } }],
        toolCallMetadata: { call: { createdAt: 'call-date' } },
        toolResult: { id: 'stale', createdAt: 'stale', content: 'stale' },
      },
    }
    const wire = JSON.parse(
      JSON.stringify(
        uiMessagesToWire([
          {
            id: 'result-1',
            role: 'tool',
            name: 'createImage',
            toolCallId: 'call-image',
            content,
            metadata,
            createdAt,
          },
        ]),
      ),
    )

    expect(wire[0]).toEqual({
      id: 'result-1',
      role: 'tool',
      name: 'createImage',
      toolCallId: 'call-image',
      content: JSON.stringify(content),
      metadata: {
        ...metadata,
        tanstack: {
          ...metadata.tanstack,
          toolResult: {
            id: 'result-1',
            createdAt: createdAt.toISOString(),
            content,
          },
        },
      },
    })

    expect(convertMessagesToModelMessages(wire)).toEqual([
      {
        id: 'result-1',
        role: 'tool',
        name: 'createImage',
        toolCallId: 'call-image',
        content,
        metadata: {
          source: 'test',
          createdAt: 'metadata-date',
          nested: { createdAt: 'nested-date' },
          tanstack: {
            createdAt: 'tanstack-date',
            uiResources: [{ type: 'ui-resource', resource: { value: 1 } }],
            toolCallMetadata: { call: { createdAt: 'call-date' } },
          },
        },
        createdAt,
      },
    ])
  })

  it('preserves ModelMessage name on the AG-UI wire', () => {
    const wire = uiMessagesToWire([
      { id: 'u1', role: 'user', content: 'hi', name: 'Dana' },
    ])

    expect(wire[0]).toMatchObject({
      id: 'u1',
      role: 'user',
      content: 'hi',
      name: 'Dana',
    })
  })

  it('uses a unique tool wire id when a tool ModelMessage reuses the assistant id', () => {
    const wire = uiMessagesToWire([
      { id: 'a1', role: 'assistant', content: 'ok' },
      {
        id: 'a1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '[]',
        metadata: { tanstack: { toolResult: { id: 'tool-call-1' } } },
      },
    ])

    expect(wire).toEqual([
      { id: 'a1', role: 'assistant', content: 'ok' },
      {
        id: 'tool-call-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '[]',
        metadata: { tanstack: { toolResult: { id: 'a1' } } },
      },
    ])
  })

  it('preserves tool ModelMessage fields', () => {
    const wire = uiMessagesToWire([
      {
        id: 'result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '[]',
        metadata: { tanstack: { toolResult: { id: 'result-1' } } },
      },
    ])

    expect(wire).toEqual([
      {
        id: 'result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '[]',
        metadata: { tanstack: { toolResult: { id: 'result-1' } } },
      },
    ])
  })

  it('preserves a tool ModelMessage error', () => {
    const wire = uiMessagesToWire([
      {
        id: 'result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '{"error":"boom"}',
        error: 'boom',
        metadata: { tanstack: { toolResult: { id: 'result-1' } } },
      },
    ])

    expect(wire).toEqual([
      {
        id: 'result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '{"error":"boom"}',
        error: 'boom',
        metadata: { tanstack: { toolResult: { id: 'result-1' } } },
      },
    ])
  })

  it('preserves assistant ModelMessage fields', () => {
    const wire = uiMessagesToWire([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'I will check.',
        thinking: [{ content: 'Use the lookup tool', signature: 'sig-1' }],
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"id":1}' },
            metadata: { thoughtSignature: 'tool-sig-1' },
          },
        ],
      },
    ])

    expect(wire).toEqual([
      {
        id: expect.any(String),
        role: 'reasoning',
        content: 'Use the lookup tool',
        encryptedValue: 'sig-1',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'I will check.',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"id":1}' },
            encryptedValue: 'tool-sig-1',
          },
        ],
        metadata: {
          tanstack: {
            toolCallMetadata: {
              'call-1': { thoughtSignature: 'tool-sig-1' },
            },
          },
        },
      },
    ])
  })

  it('round-trips null tool-call metadata losslessly', () => {
    const wire = uiMessagesToWire([
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'lookup',
            arguments: '{}',
            state: 'input-complete',
            metadata: null,
          },
        ],
      },
    ])

    expect(wire[0]).toHaveProperty(
      'metadata.tanstack.toolCallMetadata.call-1',
      null,
    )
    const assistant = wire[0]
    if (assistant?.role !== 'assistant') {
      throw new Error('missing assistant wire message')
    }
    const model = convertMessagesToModelMessages([
      { ...assistant, content: assistant.content ?? null },
    ])
    expect(model[0]).toHaveProperty('toolCalls.0.metadata', null)
  })

  it('converts multimodal user ModelMessage content to AG-UI content', () => {
    const wire = uiMessagesToWire([
      {
        id: 'user-1',
        role: 'user',
        content: [
          { type: 'text', content: 'Look at this' },
          {
            type: 'image',
            source: {
              type: 'url',
              value: 'https://example.com/cat.png',
              mimeType: 'image/png',
            },
          },
        ],
      },
    ])

    expect(wire).toEqual([
      {
        id: 'user-1',
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this' },
          {
            type: 'image',
            source: {
              type: 'url',
              value: 'https://example.com/cat.png',
              mimeType: 'image/png',
            },
          },
        ],
      },
    ])
  })

  it('generates an AG-UI id for a ModelMessage without one', () => {
    const wire = uiMessagesToWire([{ role: 'user', content: 'hello' }])

    expect(wire).toEqual([
      { id: expect.any(String), role: 'user', content: 'hello' },
    ])
  })

  it('emits a separate reasoning fan-out before the assistant anchor for each ThinkingPart', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'thinking', content: 'pondering' },
          { type: 'text', content: 'answer' },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire).toHaveLength(2)
    expect(wire[0]!).toMatchObject({ role: 'reasoning', content: 'pondering' })
    expect(wire[1]!).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'answer',
    })
  })

  it('round-trips empty thinking content when signature is present', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'thinking',
            content: '',
            signature: '{"id":"rs_1","encrypted_content":"enc"}',
          },
          {
            type: 'tool-call',
            id: 'call_1',
            name: 'lookup_weather',
            arguments: '{"location":"Berlin"}',
            state: 'input-complete',
          },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    const model = convertMessagesToModelMessages(
      wire as Array<UIMessage | ModelMessage>,
    )
    expect(model[0]?.thinking).toEqual([
      {
        content: '',
        signature: '{"id":"rs_1","encrypted_content":"enc"}',
      },
    ])
  })

  it('round-trips ThinkingPart.signature on spec encryptedValue', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'thinking', content: 'pondering', signature: 'sig-1' },
          { type: 'text', content: 'answer' },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    const reasoning = wire[0]
    expect(reasoning).toEqual({
      role: 'reasoning',
      id: expect.any(String),
      content: 'pondering',
      encryptedValue: 'sig-1',
    })
    expect(reasoning).not.toHaveProperty('metadata')

    const model = convertMessagesToModelMessages(
      wire as Array<UIMessage | ModelMessage>,
    )
    expect(model[0]?.thinking).toEqual([
      { content: 'pondering', signature: 'sig-1' },
    ])
  })

  it('round-trips Gemini thoughtSignature on toolCalls.encryptedValue', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tc1',
            name: 'get_weather',
            arguments: '{}',
            state: 'input-complete',
            metadata: { thoughtSignature: 'sig-g' },
          },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    const assistant = wire[0]
    expect(assistant).toMatchObject({
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{}' },
          encryptedValue: 'sig-g',
        },
      ],
    })

    const model = convertMessagesToModelMessages(
      wire as Array<UIMessage | ModelMessage>,
    )
    expect(model[0]?.toolCalls?.[0]?.metadata).toEqual({
      thoughtSignature: 'sig-g',
    })
  })

  it('does not put parts on wire messages', () => {
    const messages: Array<UIMessage> = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire[0]).not.toHaveProperty('parts')
  })

  it('serializes a structured-output part to assistant content using its raw JSON', () => {
    // The raw JSON is the byte-identical buffer the model produced. Sending
    // it back as assistant content keeps multi-turn structured chat coherent
    // (the LLM sees its own prior structured response).
    const raw = JSON.stringify({ name: 'Alice', age: 25 })
    const messages: Array<UIMessage> = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'extract' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'complete',
            raw,
            data: { name: 'Alice', age: 25 },
            partial: { name: 'Alice', age: 25 },
          },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    expect(anchorContent(wire, 'assistant')).toBe(raw)
  })

  it('skips streaming and errored structured-output parts so partial JSON is never sent as history', () => {
    // A part captured mid-stream (or after a RUN_ERROR) holds an incomplete
    // JSON fragment in `raw`. Shipping that as assistant content would feed
    // malformed JSON back to the LLM. The wire must drop these.
    const streaming: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'streaming',
            raw: '{"name":"Al',
          },
        ],
      },
    ]
    expect(
      anchorContent(uiMessagesToWire(streaming), 'assistant'),
    ).toBeUndefined()

    const errored: Array<UIMessage> = [
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'error',
            raw: '{"name":"Bo',
            errorMessage: 'aborted',
          },
        ],
      },
    ]
    expect(
      anchorContent(uiMessagesToWire(errored), 'assistant'),
    ).toBeUndefined()
  })

  it('drops a complete structured-output part with empty raw (defensive — completeStructuredOutputPart guarantees non-empty raw)', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'complete',
            raw: '',
            data: { name: 'Bob' },
          },
        ],
      },
    ]
    expect(
      anchorContent(uiMessagesToWire(messages), 'assistant'),
    ).toBeUndefined()
  })

  it('preserves per-part metadata on multimodal content (not via parts)', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'u1',
        role: 'user',
        parts: [
          {
            type: 'image',
            source: { type: 'data', value: 'base64...', mimeType: 'image/png' },
            metadata: { detail: 'high' },
          },
        ],
      },
    ]
    const wire = uiMessagesToWire(messages)
    expect(wire[0]).not.toHaveProperty('parts')
    const content = anchorContent(wire, 'user')
    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) {
      throw new Error('expected multimodal user content')
    }
    const first = content[0]
    expect(
      first && typeof first === 'object' && 'metadata' in first
        ? first.metadata
        : undefined,
    ).toEqual({ detail: 'high' })
  })

  it('copies user metadata and writes metadata.tanstack.createdAt as ISO-8601', () => {
    const createdAt = new Date('2026-08-20T00:00:00.000Z')
    const wire = uiMessagesToWire([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', content: 'hi' }],
        createdAt,
        metadata: { author: { id: 'user-42', name: 'Dana' } },
      },
    ])
    expect(wire[0]).toEqual({
      id: 'u1',
      role: 'user',
      content: 'hi',
      metadata: {
        author: { id: 'user-42', name: 'Dana' },
        tanstack: { createdAt: '2026-08-20T00:00:00.000Z' },
      },
    })
  })

  it('serializes a JSON-revived createdAt string without throwing', () => {
    const iso = '2026-08-20T00:00:00.000Z'
    const message: UIMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(iso),
    }
    Object.assign(message, {
      createdAt: JSON.parse(JSON.stringify(message.createdAt)),
    })
    expect(typeof message.createdAt).toBe('string')

    const wire = uiMessagesToWire([message])
    expect(wire[0]).toEqual({
      id: 'u1',
      role: 'user',
      content: 'hi',
      metadata: { tanstack: { createdAt: iso } },
    })
  })

  it('ignores an invalid createdAt string instead of throwing', () => {
    const message: UIMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
    }
    Object.assign(message, { createdAt: 'not-a-date' })

    const wire = uiMessagesToWire([message])
    expect(wire[0]).toEqual({
      id: 'u1',
      role: 'user',
      content: 'hi',
    })
  })

  it('restores metadata.tanstack.createdAt on the model message', () => {
    const wire = uiMessagesToWire([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', content: 'hi' }],
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
      },
    ])

    const model = convertMessagesToModelMessages(
      wire as Array<UIMessage | ModelMessage>,
    )

    expect(model[0]?.createdAt).toEqual(new Date('2026-08-20T00:00:00.000Z'))
  })

  it('does not put parts or createdAt Date on assistant anchors', () => {
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        parts: [
          { type: 'text', content: 'ok' },
          {
            type: 'tool-call',
            id: 'tc1',
            name: 'getTodos',
            arguments: '{}',
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            content: '{}',
            state: 'complete',
          },
        ],
      },
    ])
    const anchor = wire.find((m) => m.role === 'assistant')
    expect(anchor).not.toHaveProperty('parts')
    expect(anchor).not.toHaveProperty('createdAt')
    expect(anchor).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'ok',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'getTodos', arguments: '{}' },
        },
      ],
      metadata: { tanstack: { createdAt: '2026-08-20T00:00:00.000Z' } },
    })
    expect(wire).toHaveLength(2)
    expect(wire[1]).toMatchObject({
      role: 'tool',
      toolCallId: 'tc1',
      content: '{}',
    })
    expect(wire[1]).not.toHaveProperty('parts')
  })

  it('stores unfinished structured-output leftover under metadata.tanstack.structuredOutput', () => {
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'error',
            raw: '{',
            errorMessage: 'invalid',
          },
        ],
      },
    ])
    expect(wire[0]).toMatchObject({
      role: 'assistant',
      metadata: {
        tanstack: {
          structuredOutput: {
            status: 'error',
            raw: '{',
            errorMessage: 'invalid',
          },
        },
      },
    })
  })

  it('puts ui-resource parts in metadata.tanstack.uiResources, not on wire parts', () => {
    const uiResource = {
      type: 'ui-resource' as const,
      resource: {
        uri: 'ui://widget/todos',
        mimeType: 'text/html',
        text: '<div>todos</div>',
      },
      toolCallId: 'tc1',
      toolName: 'getTodos',
    }
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', content: 'here' }, uiResource],
      },
    ])
    expect(wire[0]).not.toHaveProperty('parts')
    expect(wire[0]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'here',
      metadata: { tanstack: { uiResources: [uiResource] } },
    })
  })

  it('stores complete structured-output state in snapshot metadata', () => {
    const wire = uiMessagesToWire(
      [
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'complete',
              raw: '{"ok":true}',
              partial: { ok: true },
              data: { ok: true },
              reasoning: 'Checked the result',
            },
          ],
        },
      ],
      { includeSnapshotStructuredOutput: true },
    )

    expect(wire[0]).toMatchObject({
      role: 'assistant',
      content: '{"ok":true}',
      metadata: {
        tanstack: {
          structuredOutput: {
            status: 'complete',
            raw: '{"ok":true}',
            partial: { ok: true },
            data: { ok: true },
            reasoning: 'Checked the result',
          },
        },
      },
    })
  })

  it('does not carry stale TanStack metadata into a later snapshot', () => {
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        metadata: {
          tanstack: {
            structuredOutput: { status: 'complete', raw: '{"old":true}' },
            uiResources: [],
            toolCallMetadata: { old: { value: true } },
            createdAt: '2026-08-20T00:00:00.000Z',
          },
        },
        parts: [{ type: 'text', content: 'new' }],
      },
    ])

    expect(wire[0]).toMatchObject({
      content: 'new',
    })
    expect(wire[0]).not.toHaveProperty('metadata.tanstack.structuredOutput')
    expect(wire[0]).not.toHaveProperty('metadata.tanstack.uiResources')
    expect(wire[0]).not.toHaveProperty('metadata.tanstack.toolCallMetadata')
  })

  it('keeps distinct per-tool ids and metadata when multiple results are emitted', () => {
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'one',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            id: 'result-1',
            name: 'one',
            toolCallId: 'call-1',
            content: '1',
            state: 'complete',
            metadata: { n: 1 },
          },
          {
            type: 'tool-call',
            id: 'call-2',
            name: 'two',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            id: 'result-2',
            name: 'two',
            toolCallId: 'call-2',
            content: '2',
            state: 'complete',
            metadata: { n: 2 },
          },
        ],
      },
    ])
    expect(wire.filter((message) => message.role === 'tool')).toMatchObject([
      { id: 'result-1', name: 'one', metadata: { n: 1 } },
      { id: 'result-2', name: 'two', metadata: { n: 2 } },
    ])
  })

  it('suffixes duplicate explicit tool-result ids', () => {
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            id: 'same',
            toolCallId: 'call-1',
            content: '1',
            state: 'complete',
          },
          {
            type: 'tool-result',
            id: 'same',
            toolCallId: 'call-2',
            content: '2',
            state: 'complete',
          },
        ],
      },
    ])
    expect(
      wire
        .filter((message) => message.role === 'tool')
        .map((message) => message.id),
    ).toEqual(['same', 'same-2'])
  })

  it('keeps each tool result timestamp in snapshot metadata', () => {
    const first = new Date('2026-08-20T00:00:00.000Z')
    const second = new Date('2026-08-20T00:00:01.000Z')
    const wire = uiMessagesToWire([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            content: '1',
            state: 'complete',
            createdAt: first,
          },
          {
            type: 'tool-result',
            toolCallId: 'call-2',
            content: '2',
            state: 'complete',
            createdAt: second,
          },
        ],
      },
    ])
    expect(
      wire
        .filter((message) => message.role === 'tool')
        .map((message) => message.metadata?.tanstack?.toolResult?.createdAt),
    ).toEqual([first.toISOString(), second.toISOString()])
  })
})
