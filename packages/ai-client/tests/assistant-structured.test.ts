import { describe, expect, it } from 'vitest'
import { computeStructuredParts } from '../src/assistant-structured.js'
import type { UIMessage } from '../src/types.js'

function userMessage(id: string): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', content: 'hi' }],
  }
}

function assistantWithStructuredOutput(
  id: string,
  part: {
    status: 'streaming' | 'complete' | 'error'
    partial?: unknown
    data?: unknown
    raw?: string
  },
): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'structured-output',
        status: part.status,
        partial: part.partial,
        data: part.data,
        raw: part.raw ?? '',
      },
    ],
  }
}

describe('computeStructuredParts', () => {
  it('returns { partial: {}, final: null } when there is no user message', () => {
    const messages: Array<UIMessage> = [
      assistantWithStructuredOutput('a1', {
        status: 'complete',
        data: { foo: 'bar' },
      }),
    ]

    expect(computeStructuredParts(messages)).toEqual({
      partial: {},
      final: null,
    })
  })

  it('returns partial from a streaming structured-output part after the latest user message', () => {
    const messages: Array<UIMessage> = [
      userMessage('u1'),
      assistantWithStructuredOutput('a1', {
        status: 'streaming',
        partial: { name: 'Al' },
      }),
    ]

    expect(computeStructuredParts(messages)).toEqual({
      partial: { name: 'Al' },
      final: null,
    })
  })

  it('falls back to data for partial when a streaming part has no partial field', () => {
    const messages: Array<UIMessage> = [
      userMessage('u1'),
      assistantWithStructuredOutput('a1', {
        status: 'streaming',
        data: { name: 'Al' },
      }),
    ]

    expect(computeStructuredParts(messages)).toEqual({
      partial: { name: 'Al' },
      final: null,
    })
  })

  it('returns final from a complete structured-output part after the latest user message', () => {
    const messages: Array<UIMessage> = [
      userMessage('u1'),
      assistantWithStructuredOutput('a1', {
        status: 'complete',
        partial: { name: 'Alem' },
        data: { name: 'Alem' },
      }),
    ]

    expect(computeStructuredParts(messages)).toEqual({
      partial: { name: 'Alem' },
      final: { name: 'Alem' },
    })
  })

  it('does not leak a final from a structured-output part before the latest user message', () => {
    const messages: Array<UIMessage> = [
      assistantWithStructuredOutput('a1', {
        status: 'complete',
        data: { name: 'stale' },
      }),
      userMessage('u1'),
    ]

    expect(computeStructuredParts(messages)).toEqual({
      partial: {},
      final: null,
    })
  })
})
