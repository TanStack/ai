import { describe, expect, it } from 'vitest'
import { inMemory } from '../../src/providers/in-memory'
import { runMemoryAdapterContract } from '../contract'

runMemoryAdapterContract('inMemory', () => inMemory())

describe('inMemory options', () => {
  it('runs an extractor on save and surfaces extracted facts on recall', async () => {
    const adapter = inMemory({
      extract: (turn) => [
        { text: `fact: ${turn.user}`, kind: 'fact', importance: 1 },
      ],
    })
    const scope = { threadId: 's1', userId: 'u1' }
    await adapter.save(scope, { user: 'I live in Berlin', assistant: 'ok' })
    const result = await adapter.recall(scope, 'Berlin')
    expect(result.systemPrompt).toContain('fact:')
    expect(result.systemPrompt.toLowerCase()).toContain('berlin')
  })

  it('respects the userId dimension of scope', async () => {
    const adapter = inMemory()
    await adapter.save(
      { threadId: 's', userId: 'a' },
      {
        user: 'apples are red',
        assistant: 'ok',
      },
    )
    const sameThreadOtherUser = await adapter.recall(
      { threadId: 's', userId: 'b' },
      'apples',
    )
    expect(sameThreadOtherUser.systemPrompt).toBe('')
  })

  it('respects the tenantId dimension of scope', async () => {
    const adapter = inMemory()
    await adapter.save(
      { threadId: 's', userId: 'u', tenantId: 'tenant-a' },
      {
        user: 'apples are red',
        assistant: 'ok',
      },
    )
    const otherTenant = await adapter.recall(
      { threadId: 's', userId: 'u', tenantId: 'tenant-b' },
      'apples',
    )
    expect(otherTenant.systemPrompt).toBe('')
  })
})
