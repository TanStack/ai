import { describe, expect, it } from 'vitest'
import { InMemoryRunStore } from '../src/activities/chat/middleware/run-store'

describe('RunRecord harness fields', () => {
  it('stores kind, activity, agent, and principal on first create only', async () => {
    const store = new InMemoryRunStore()

    await store.createOrResume({
      runId: 'op-1',
      threadId: 't-1',
      startedAt: 1,
      kind: 'activity',
      activity: 'image',
      agent: 'heroImage',
      principal: { id: 'user-1' },
    })
    // A resume must not change identity fields.
    const again = await store.createOrResume({
      runId: 'op-1',
      threadId: 't-1',
      startedAt: 2,
      kind: 'chat',
    })

    expect(again).toMatchObject({
      kind: 'activity',
      activity: 'image',
      agent: 'heroImage',
      principal: { id: 'user-1' },
      startedAt: 1,
    })
  })

  it('patches result, artifacts, lease, and checkpoint', async () => {
    const store = new InMemoryRunStore()
    await store.createOrResume({ runId: 'op-2', threadId: 't-1', startedAt: 1 })

    await store.update('op-2', {
      result: { url: 'https://example.com/a.png' },
      artifacts: [{ artifactId: 'art-1', mimeType: 'image/png' }],
      leaseOwner: 'host-a',
      leaseExpiresAt: 30_000,
      checkpoint: {
        at: 10,
        pendingTools: [{ toolCallId: 'c1', name: 'deploy', replay: 'never' }],
      },
    })

    expect(await store.get('op-2')).toMatchObject({
      result: { url: 'https://example.com/a.png' },
      artifacts: [{ artifactId: 'art-1', mimeType: 'image/png' }],
      leaseOwner: 'host-a',
      leaseExpiresAt: 30_000,
      checkpoint: { at: 10, pendingTools: [{ replay: 'never' }] },
    })
  })
})
