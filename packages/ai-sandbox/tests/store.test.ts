import { describe, expect, it } from 'vitest'
import { InMemorySandboxStore } from '../src/store'

describe('InMemorySandboxStore', () => {
  it('round-trips upsert/get/delete', async () => {
    const store = new InMemorySandboxStore()
    expect(await store.get('k')).toBeNull()
    await store.upsert({
      key: 'k',
      provider: 'docker',
      providerSandboxId: 'sbx-1',
      threadId: 't',
      updatedAt: 1,
    })
    expect((await store.get('k'))?.providerSandboxId).toBe('sbx-1')
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })
})
