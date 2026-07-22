import { describe, expect, it } from 'vitest'
import { inMemory } from '../src/in-memory'
import { runMemoryAdapterContract } from './contract'

runMemoryAdapterContract('inMemory', () => inMemory())

describe('inMemory options', () => {
  it('runs an extractor on save and surfaces extracted facts on recall', async () => {
    const adapter = inMemory({
      extract: (turn) => [{ text: `fact: ${turn.user}`, kind: 'fact', importance: 1 }],
    })
    const scope = { sessionId: 's1', userId: 'u1' }
    await adapter.save(scope, { user: 'I live in Berlin', assistant: 'ok' })
    const result = await adapter.recall(scope, 'Berlin')
    expect(result.systemPrompt).toContain('fact:')
    expect(result.systemPrompt.toLowerCase()).toContain('berlin')
  })

  it('respects the userId dimension of scope', async () => {
    const adapter = inMemory()
    await adapter.save({ sessionId: 's', userId: 'a' }, {
      user: 'apples are red',
      assistant: 'ok',
    })
    const sameSessionOtherUser = await adapter.recall(
      { sessionId: 's', userId: 'b' },
      'apples',
    )
    expect(sameSessionOtherUser.systemPrompt).toBe('')
  })
})
