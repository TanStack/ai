import { describe, expect, it } from 'vitest'
import { loadChildTranscript, memoryPersistence } from '../src'
import type { ModelMessage } from '@tanstack/ai'

/** A stored child message whose head marker names `parentThreadId`. */
function child(parentThreadId: string, content: string): ModelMessage {
  return {
    role: 'assistant',
    content,
    metadata: { 'tanstack:subagentChild': { parentThreadId, prompt: 'Go' } },
  }
}

describe('loadChildTranscript', () => {
  it('loads a child and a nested child of the thread, and no other', async () => {
    const { messages } = memoryPersistence().stores
    await messages.saveThread('subagent:a', [child('t', 'From a')])
    await messages.saveThread('subagent:b', [child('subagent:a', 'From b')])
    await messages.saveThread('subagent:c', [child('other', 'From c')])

    const nested = await loadChildTranscript(messages, 'b', 't')
    expect(nested?.map((message) => message.content)).toEqual(['Go', 'From b'])
    expect(await loadChildTranscript(messages, 'a', 't')).toHaveLength(2)
    expect(await loadChildTranscript(messages, 'c', 't')).toBeUndefined()
    expect(await loadChildTranscript(messages, 'none', 't')).toBeUndefined()
  })

  it('keeps the card of a child with no messages', async () => {
    const { messages } = memoryPersistence().stores
    const card = { name: 'writer', status: 'error', placeholder: true }
    await messages.saveThread('subagent:p', [
      {
        role: 'assistant',
        content: '',
        metadata: {
          tanstack: { subagent: card },
          'tanstack:subagentChild': { parentThreadId: 't' },
        },
      },
    ])

    const loaded = await loadChildTranscript(messages, 'p', 't')

    expect(loaded?.[0]?.metadata?.tanstack).toEqual({ subagent: card })
  })

  it('stops at a loop in the stored parents', async () => {
    const { messages } = memoryPersistence().stores
    await messages.saveThread('subagent:x', [child('subagent:y', 'x')])
    await messages.saveThread('subagent:y', [child('subagent:x', 'y')])

    expect(await loadChildTranscript(messages, 'x', 't')).toBeUndefined()
  })
})
