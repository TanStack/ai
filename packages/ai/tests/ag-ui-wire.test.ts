import { describe, it, expect } from 'vitest'
import { convertMessagesToModelMessages } from '../src/activities/chat/messages'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import type { ModelMessage, UIMessage } from '../src/types'

describe('uiMessagesToWire', () => {
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
    expect(Array.isArray((wire[0]! as any).content)).toBe(true)
    expect((wire[0]! as any).content).toHaveLength(2)
    expect((wire[0]! as any).content[0]).toEqual({
      type: 'text',
      text: 'look at this',
    })
    expect((wire[0]! as any).content[1]).toMatchObject({
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
      },
    ])

    expect(wire).toEqual([
      { id: 'a1', role: 'assistant', content: 'ok' },
      {
        id: 'tool-call-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '[]',
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
      },
    ])

    expect(wire).toEqual([
      {
        id: 'result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '[]',
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
      },
    ])

    expect(wire).toEqual([
      {
        id: 'result-1',
        role: 'tool',
        toolCallId: 'call-1',
        content: '{"error":"boom"}',
        error: 'boom',
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
    const assistant = wire.find((m) => m.role === 'assistant') as any
    expect(assistant).toBeDefined()
    expect(assistant.content).toBe(raw)
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
      (uiMessagesToWire(streaming).find((m) => m.role === 'assistant') as any)
        .content,
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
      (uiMessagesToWire(errored).find((m) => m.role === 'assistant') as any)
        .content,
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
    const wire = uiMessagesToWire(messages)
    const assistant = wire.find((m) => m.role === 'assistant') as any
    expect(assistant.content).toBeUndefined()
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
    const content = (wire[0]! as { content: Array<{ metadata?: unknown }> })
      .content
    expect(content[0]?.metadata).toEqual({ detail: 'high' })
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
})
