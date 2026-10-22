import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { permissions } from '../src/first-party/permissions'
import { mockAdapter, text, toolCall } from './helpers'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 'remote-waits'

/** The harness of one host: `deploy` asks for an approval before it runs. */
function harnessWith(replies: Array<Reply>) {
  const deploy = toolDefinition({
    name: 'deploy',
    description: 'Deploy the app.',
    inputSchema: z.object({}),
  }).server(() => Promise.resolve({ deployed: 'v2' }))
  return defineHarness({
    name: 'test/remote-waits',
    adapter: mockAdapter(replies).adapter,
    tools: [deploy],
    plugins: () => [
      permissions({ rules: [{ tool: 'deploy', decision: 'ask' }] }),
    ],
  })
}

describe('the waits that another host writes', () => {
  it('show in the snapshot of a session that does not own the log', async () => {
    // Two hosts on one log backend: two servers on one database.
    const logState = memoryLogState()
    const hostA = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ state: logState }) } },
    })
    const hostB = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ state: logState }) } },
    })
    // B opens the thread first, so it reads the log before the wait opens.
    const sessionB = await hostB.open(harnessWith([() => text('Deployed.')]), {
      threadId: THREAD,
    })
    const sessionA = await hostA.open(
      harnessWith([() => toolCall('deploy', {}, 'c1')]),
      { threadId: THREAD },
    )
    try {
      const turn = await sessionA.send('deploy it')
      expect(turn.interrupts).toHaveLength(1)
      expect(sessionA.snapshot().status).toBe('requires_action')

      await waitFor(() => {
        const snapshot = sessionB.snapshot()
        expect(snapshot.status).toBe('requires_action')
        expect(snapshot.pendingWaits).toEqual([
          expect.objectContaining({ kind: 'approval', turn: true }),
        ])
      })
      const [wait] = sessionB.snapshot().pendingWaits
      if (!wait) throw new Error('No approval.')

      const inputId = `answer:${wait.waitId}`
      await sessionB.resolve({
        resume: [
          { interruptId: wait.waitId, status: 'resolved', payload: true },
        ],
        inputId,
      })
      await sessionB.settled({ inputId })
      expect(sessionB.snapshot()).toMatchObject({
        status: 'idle',
        pendingWaits: [],
      })

      // A released the log while it waited, and B ended the wait.
      await waitFor(() =>
        expect(sessionA.snapshot()).toMatchObject({
          status: 'idle',
          pendingWaits: [],
        }),
      )
    } finally {
      await sessionA.close()
      await sessionB.close()
      await hostA.close()
      await hostB.close()
    }
  }, 20_000)
})
