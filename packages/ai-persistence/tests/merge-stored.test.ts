import { describe, expect, it } from 'vitest'
import { mergeStoredMessages } from '../src/merge-stored'
import type { ModelMessage } from '@tanstack/ai'

const user: ModelMessage = { id: 'u1', role: 'user', content: 'hi' }
const assistant: ModelMessage = {
  id: 'a1',
  role: 'assistant',
  content: null,
  toolCalls: [
    {
      id: 'call_1',
      type: 'function',
      function: { name: 'lookup', arguments: '{}' },
    },
  ],
}
// A later message keeps the stored tool result inside the merge prefix, the
// same as a resumed run that posts the turn after the tool result.
const followUp: ModelMessage = { id: 'a2', role: 'assistant', content: 'ok' }
const result = (
  content: string,
  id?: string,
  metadata?: ModelMessage['metadata'],
): ModelMessage => ({
  ...(id && { id }),
  role: 'tool',
  toolCallId: 'call_1',
  content,
  ...(metadata && { metadata }),
})

const sources = [{ id: 'doc-1', title: 'Doc 1', url: 'https://example.com/1' }]
const fakeSources = [{ id: 'fake', title: 'Fake', url: 'https://evil.test' }]
const tanstack = { toolResultOutcome: 'success' }

describe('mergeStoredMessages: tool results', () => {
  it('replaces a stored tool result posted under a new id in place', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old'), followUp],
      [user, assistant, result('new', 'snapshot_r1_2'), followUp],
    )
    expect(merged).toEqual([
      user,
      assistant,
      result('new', 'snapshot_r1_2'),
      followUp,
    ])
  })

  it('appends tool results that have no toolCallId', () => {
    const stored: ModelMessage = { role: 'tool', content: 'a' }
    const incoming: ModelMessage = { id: 'x', role: 'tool', content: 'b' }
    expect(mergeStoredMessages([stored], [incoming])).toEqual([
      stored,
      incoming,
    ])
  })
})

describe('mergeStoredMessages: tool result metadata', () => {
  it('keeps the stored app metadata when the client copy has none', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old', 't1', { sources })],
      [user, assistant, result('new', 't1')],
    )
    expect(merged).toEqual([user, assistant, result('new', 't1', { sources })])
  })

  it('keeps the stored app keys and the incoming tanstack key', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old', 't1', { sources })],
      [
        user,
        assistant,
        result('new', 't1', { sources: fakeSources, tanstack }),
      ],
    )
    expect(merged).toEqual([
      user,
      assistant,
      result('new', 't1', { sources, tanstack }),
    ])
  })

  it('keeps the stored app keys for a resumed result under a new id', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old', 't1', { sources }), followUp],
      [
        user,
        assistant,
        result('new', 'snapshot_r1_2', { sources: fakeSources, tanstack }),
        followUp,
      ],
    )
    expect(merged).toEqual([
      user,
      assistant,
      result('new', 'snapshot_r1_2', { sources, tanstack }),
      followUp,
    ])
  })

  it('drops incoming app keys when the stored result has none', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old', 't1')],
      [
        user,
        assistant,
        result('new', 't1', { sources: fakeSources, tanstack }),
      ],
    )
    expect(merged).toEqual([user, assistant, result('new', 't1', { tanstack })])
  })

  it('removes metadata that only had incoming app keys', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old', 't1')],
      [user, assistant, result('new', 't1', { sources: fakeSources })],
    )
    expect(merged[2]).not.toHaveProperty('metadata')
  })
})
