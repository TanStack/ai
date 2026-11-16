import { describe, expect, it } from 'vitest'
import { createApprovalStore } from '../src/approval'

function fixedIds() {
  let n = 0
  return () => `id-${(n += 1)}`
}

describe('createApprovalStore', () => {
  it('proposes, then confirms once, running the action', async () => {
    const store = createApprovalStore({ now: () => 0, newId: fixedIds() })
    let ran = 0
    const env = store.propose({
      owner: 'alice',
      summary: 'Add Dune to Radarr',
      run: async () => {
        ran += 1
        return 'done'
      },
    })
    expect(env).toMatchObject({
      status: 'approval_required',
      proposalId: 'id-1',
      summary: 'Add Dune to Radarr',
    })
    expect(store.pendingCount()).toBe(1)

    expect(await store.confirm('id-1', 'alice')).toBe('done')
    expect(ran).toBe(1)
    expect(store.pendingCount()).toBe(0)
  })

  it('is single-use: a second confirm fails', async () => {
    const store = createApprovalStore({ now: () => 0, newId: fixedIds() })
    store.propose({ owner: 'a', summary: 's', run: async () => 1 })
    await store.confirm('id-1', 'a')
    await expect(store.confirm('id-1', 'a')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('refuses a confirm from another owner', async () => {
    const store = createApprovalStore({ now: () => 0, newId: fixedIds() })
    store.propose({ owner: 'a', summary: 's', run: async () => 1 })
    await expect(store.confirm('id-1', 'b')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('expires a proposal after the ttl', async () => {
    let t = 0
    const store = createApprovalStore({
      ttlMs: 100,
      now: () => t,
      newId: fixedIds(),
    })
    store.propose({ owner: 'a', summary: 's', run: async () => 1 })
    t = 100
    await expect(store.confirm('id-1', 'a')).rejects.toMatchObject({
      code: 'proposal_expired',
    })
    expect(store.pendingCount()).toBe(0)
  })
})
