import { describe, expect, it } from 'vitest'
import { createUserMcpTokenStore } from '../src/oauth-redirect'
import type { McpTokenSet } from '../src/oauth-redirect'

describe('createUserMcpTokenStore', () => {
  it('scopes load/save/clear to userId + serverId', async () => {
    const map = new Map<string, McpTokenSet>()
    const store = createUserMcpTokenStore({
      userId: 'u1',
      serverId: 'notion',
      backend: {
        get: async (userId, serverId) => map.get(`${userId}:${serverId}`),
        set: async (userId, serverId, tokens) => {
          map.set(`${userId}:${serverId}`, tokens)
        },
        delete: async (userId, serverId) => {
          map.delete(`${userId}:${serverId}`)
        },
      },
    })

    expect(await store.load()).toBeUndefined()
    await store.save({ accessToken: 'a1' })
    expect(await store.load()).toEqual({ accessToken: 'a1' })
    expect(map.get('u1:notion')).toEqual({ accessToken: 'a1' })
    await store.clear()
    expect(await store.load()).toBeUndefined()
  })
})
