import { describe, it, expect } from 'vitest'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import type { UIMessage } from '../src/types'

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
    expect((wire[0]! as any).parts).toBeDefined()
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

  it('preserves the original `parts` array on every anchor message', () => {
    const messages: Array<UIMessage> = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
    ]
    const wire = uiMessagesToWire(messages)
    expect((wire[0]! as any).parts).toEqual([{ type: 'text', content: 'hi' }])
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

  it('preserves per-part metadata on multimodal parts (round-trip via parts field)', () => {
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
    const partOnAnchor = (wire[0]! as any).parts[0]
    expect(partOnAnchor.metadata).toEqual({ detail: 'high' })
  })
})
