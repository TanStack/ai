import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text } from './helpers'
import type { AnyHarness } from '../src'

const THREAD = 't1'
const alice = { id: 'alice' }

/** Open `harness` for alice on a host without a log. */
async function open<THarness extends AnyHarness>(
  harness: THarness,
  persistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, {
    threadId: THREAD,
    principal: alice,
  })
  return { host, session }
}

describe('the thread of an agent run', () => {
  it('keeps the messages of each background run in a thread of its own', async () => {
    const persistence = memoryPersistence()
    const model = mockAdapter([() => text('Drafted.')])
    let thread = ''
    const drafter = defineAgent({
      name: 'drafter',
      description: 'Drafts',
      run: (ctx) => {
        thread = ctx.threadId
        return ctx.chat({
          adapter: model.adapter,
          messages: [{ role: 'user', content: 'Draft it.' }],
        })
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [drafter],
      }),
      persistence,
    )

    await session.agents.drafter.start()

    expect(thread).toMatch(/^t1:drafter:in-/)
    const saved = JSON.stringify(
      await persistence.stores.messages.loadThread(thread),
    )
    expect(saved).toContain('Draft it.')
    expect(saved).toContain('Drafted.')
    await host.close()
  })
})
