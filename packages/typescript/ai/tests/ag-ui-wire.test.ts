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
