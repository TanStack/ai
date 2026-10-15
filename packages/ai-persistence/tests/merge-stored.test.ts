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
const result = (content: string, id?: string): ModelMessage => ({
  ...(id && { id }),
  role: 'tool',
  toolCallId: 'call_1',
  content,
})

describe('mergeStoredMessages: tool results', () => {
  it('replaces a stored tool result posted under a new id in place', () => {
    const merged = mergeStoredMessages(
      [user, assistant, result('old')],
      [user, assistant, result('new', 'snapshot_r1_2')],
    )
    expect(merged).toEqual([user, assistant, result('new', 'snapshot_r1_2')])
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
