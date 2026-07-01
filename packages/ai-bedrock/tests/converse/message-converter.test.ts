import { describe, expect, it } from 'vitest'
import { toConverseMessages } from '../../src/converse/message-converter'
import type { ModelMessage } from '@tanstack/ai'

describe('toConverseMessages', () => {
  it('lifts system prompts into the Converse system field', () => {
    const { system, messages } = toConverseMessages(
      [{ role: 'user', content: 'hi' }],
      ['be terse'],
    )
    expect(system).toEqual([{ text: 'be terse' }])
    expect(messages).toEqual([{ role: 'user', content: [{ text: 'hi' }] }])
  })

  it('normalizes object system prompts and joins multiple', () => {
    const { system } = toConverseMessages(
      [{ role: 'user', content: 'hi' }],
      ['a', { content: 'b' }],
    )
    expect(system).toEqual([{ text: 'a' }, { text: 'b' }])
  })

  it('merges consecutive same-role messages (Converse requires alternation)', () => {
    const { messages } = toConverseMessages([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ])
    expect(messages).toEqual([
      { role: 'user', content: [{ text: 'a' }, { text: 'b' }] },
    ])
  })

  it('maps assistant tool calls to toolUse and tool results to a user toolResult', () => {
    const msgs: ModelMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 't1',
            type: 'function',
            function: { name: 'getX', arguments: '{"a":1}' },
          },
        ],
      },
      { role: 'tool', content: '{"ok":true}', toolCallId: 't1' },
    ]
    const { messages } = toConverseMessages(msgs)
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [
        { toolUse: { toolUseId: 't1', name: 'getX', input: { a: 1 } } },
      ],
    })
    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 't1',
            content: [{ text: '{"ok":true}' }],
            status: 'success',
          },
        },
      ],
    })
  })

  it('throws on malformed JSON tool-call arguments instead of forwarding {}', () => {
    expect(() =>
      toConverseMessages([
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 't1',
              type: 'function',
              function: { name: 'getX', arguments: '{"a":' },
            },
          ],
        },
      ]),
    ).toThrow(/malformed JSON/)
  })

  it('throws when tool-call arguments parse to a non-object', () => {
    expect(() =>
      toConverseMessages([
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 't1',
              type: 'function',
              function: { name: 'getX', arguments: '[1,2]' },
            },
          ],
        },
      ]),
    ).toThrow(/must be a JSON object/)
  })

  it('maps a data-source image part to a Converse image block', () => {
    const { messages } = toConverseMessages([
      {
        role: 'user',
        content: [
          { type: 'text', content: 'look' },
          {
            type: 'image',
            source: { type: 'data', value: btoa('xy'), mimeType: 'image/png' },
          },
        ],
      },
    ])
    const content = messages[0]!.content!
    const textBlock = content[0]!
    const imageBlock = content[1]!
    expect(textBlock).toEqual({ text: 'look' })
    expect(imageBlock).toMatchObject({ image: { format: 'png' } })
    // bytes decoded from base64
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((imageBlock as any).image.source.bytes).toEqual(
      new Uint8Array([120, 121]),
    )
  })

  it('throws on a URL image source (Converse needs inline bytes)', () => {
    expect(() =>
      toConverseMessages([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://x/y.png' },
            },
          ],
        },
      ]),
    ).toThrow(/inline|bytes|URL/i)
  })

  it('gives distinct names to multiple document parts in one message', () => {
    const { messages } = toConverseMessages([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'data',
              value: btoa('doc1'),
              mimeType: 'application/pdf',
            },
          },
          {
            type: 'document',
            source: {
              type: 'data',
              value: btoa('doc2'),
              mimeType: 'text/plain',
            },
          },
        ],
      },
    ])
    const content = messages[0]!.content!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name0 = (content[0] as any).document.name as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name1 = (content[1] as any).document.name as string
    expect(name0).not.toBe(name1)
    expect(name0).toMatch(/document-\d+/)
    expect(name1).toMatch(/document-\d+/)
  })

  it('gives distinct names to document parts across multiple messages', () => {
    const { messages } = toConverseMessages([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'data',
              value: btoa('doc1'),
              mimeType: 'application/pdf',
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'noted',
      },
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'data',
              value: btoa('doc2'),
              mimeType: 'text/plain',
            },
          },
        ],
      },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name0 = (messages[0]!.content![0] as any).document.name as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name1 = (messages[2]!.content![0] as any).document.name as string
    expect(name0).not.toBe(name1)
  })
})
